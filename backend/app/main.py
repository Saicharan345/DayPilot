from contextlib import asynccontextmanager
from datetime import datetime
import logging

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import Base, engine, get_db
from app.models import Task
from app.planner import generate_plan


# --------------------------------------------------
# Logging
# --------------------------------------------------

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("daypilot")


# --------------------------------------------------
# Application startup and database initialization
# --------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    logger.info("DayPilot AI database initialized.")
    yield


app = FastAPI(
    title="DayPilot AI",
    description=(
        "An AI-powered productivity assistant that "
        "turns everyday requests into actionable plans."
    ),
    version="0.4.0",
    lifespan=lifespan,
)


# --------------------------------------------------
# CORS: allow the local React frontend
# --------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# Request and response schemas
# --------------------------------------------------

class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=1000)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    completed: bool | None = None


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    completed: bool
    created_at: datetime


class PlanRequest(BaseModel):
    request: str = Field(min_length=1, max_length=2000)
    available_minutes: int = Field(ge=15, le=1440)


class PlannedTask(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=1000)
    duration_minutes: int = Field(ge=1, le=1440)


class SavePlanRequest(BaseModel):
    tasks: list[PlannedTask] = Field(min_length=1, max_length=6)


# --------------------------------------------------
# Basic endpoints
# --------------------------------------------------

@app.get("/")
def root():
    return {
        "message": "Welcome to DayPilot AI",
        "status": "running",
        "version": "0.4.0",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


# --------------------------------------------------
# Create a task
# --------------------------------------------------

@app.post(
    "/tasks",
    response_model=TaskResponse,
    status_code=201,
)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
):
    title = payload.title.strip()

    if not title:
        raise HTTPException(
            status_code=422,
            detail="Task title cannot be empty.",
        )

    task = Task(
        title=title,
        description=payload.description.strip(),
    )

    try:
        db.add(task)
        db.commit()
        db.refresh(task)
        return task
    except Exception:
        db.rollback()
        logger.exception("Failed to create task.")
        raise HTTPException(
            status_code=500,
            detail="Could not create task.",
        )


# --------------------------------------------------
# List all tasks
# --------------------------------------------------

@app.get("/tasks", response_model=list[TaskResponse])
def list_tasks(db: Session = Depends(get_db)):
    statement = select(Task).order_by(Task.id.desc())
    return db.scalars(statement).all()


# --------------------------------------------------
# Retrieve one task
# --------------------------------------------------

@app.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
):
    task = db.get(Task, task_id)

    if task is None:
        raise HTTPException(
            status_code=404,
            detail="Task not found.",
        )

    return task


# --------------------------------------------------
# Update a task
# --------------------------------------------------

@app.patch("/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
):
    task = db.get(Task, task_id)

    if task is None:
        raise HTTPException(
            status_code=404,
            detail="Task not found.",
        )

    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        raise HTTPException(
            status_code=422,
            detail="Provide at least one field to update.",
        )

    for field, value in changes.items():
        if value is None:
            raise HTTPException(
                status_code=422,
                detail=f"{field} cannot be null.",
            )

        if field == "title":
            value = value.strip()
            if not value:
                raise HTTPException(
                    status_code=422,
                    detail="Task title cannot be empty.",
                )

        elif field == "description":
            value = value.strip()

        setattr(task, field, value)

    try:
        db.commit()
        db.refresh(task)
        return task
    except Exception:
        db.rollback()
        logger.exception("Failed to update task %s.", task_id)
        raise HTTPException(
            status_code=500,
            detail="Could not update task.",
        )


# --------------------------------------------------
# Delete a task
# --------------------------------------------------

@app.delete("/tasks/{task_id}", status_code=204)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
):
    task = db.get(Task, task_id)

    if task is None:
        raise HTTPException(
            status_code=404,
            detail="Task not found.",
        )

    try:
        db.delete(task)
        db.commit()
        return Response(status_code=204)
    except Exception:
        db.rollback()
        logger.exception("Failed to delete task %s.", task_id)
        raise HTTPException(
            status_code=500,
            detail="Could not delete task.",
        )


# --------------------------------------------------
# AI planning
# --------------------------------------------------

@app.post("/plan")
def create_plan(payload: PlanRequest):
    request_text = payload.request.strip()

    if not request_text:
        raise HTTPException(
            status_code=422,
            detail="Please describe what you want to accomplish.",
        )

    try:
        plan = generate_plan(
            request=request_text,
            available_minutes=payload.available_minutes,
        )
        return plan

    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception("AI planning request failed.")

        raise HTTPException(
            status_code=502,
            detail=(
                "AI planning failed. Check the Gemini API key, "
                "model availability, quota, and server logs."
            ),
        ) from exc


# --------------------------------------------------
# Save a proposed plan as database tasks
# --------------------------------------------------

@app.post(
    "/plan/save",
    response_model=list[TaskResponse],
    status_code=201,
)
def save_plan(
    payload: SavePlanRequest,
    db: Session = Depends(get_db),
):
    tasks_to_save = []

    for item in payload.tasks:
        title = item.title.strip()

        if not title:
            raise HTTPException(
                status_code=422,
                detail="Every planned task must have a title.",
            )

        description = (
            f"{item.description.strip()} "
            f"Planned duration: {item.duration_minutes} minutes."
        ).strip()[:1000]

        tasks_to_save.append(
            Task(
                title=title,
                description=description,
                completed=False,
            )
        )

    try:
        db.add_all(tasks_to_save)
        db.commit()

        for task in tasks_to_save:
            db.refresh(task)

        return tasks_to_save

    except Exception as exc:
        db.rollback()
        logger.exception("Failed to save the proposed plan.")

        raise HTTPException(
            status_code=500,
            detail="Could not save the plan to the database.",
        ) from exc