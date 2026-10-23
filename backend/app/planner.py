import logging
import os
from datetime import datetime

from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

load_dotenv()

logger = logging.getLogger("daypilot")


class GeneratedTask(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(max_length=1000)
    duration_minutes: int = Field(ge=1, le=1440)
    order: int = Field(ge=1, le=6)


class GeneratedPlan(BaseModel):
    summary: str
    tasks: list[GeneratedTask]


def generate_fallback_plan(
    request: str,
    available_minutes: int,
) -> dict:
    """Generate a basic plan when Gemini is unavailable."""

    goals = [
        item.strip(" .,!;")
        for item in request.replace(" and ", ", ").split(",")
        if item.strip(" .,!;")
    ]

    if not goals:
        goals = [request.strip() or "Work on your main goal"]

    goals = goals[:min(6, available_minutes)]

    task_count = len(goals)
    base_minutes = available_minutes // task_count
    remaining = available_minutes
    tasks = []

    for index, goal in enumerate(goals):
        if index == task_count - 1:
            duration = remaining
        else:
            duration = base_minutes

        remaining -= duration

        tasks.append({
            "title": goal[:200],
            "description": f"Focus on completing: {goal}"[:1000],
            "duration_minutes": duration,
            "order": index + 1,
        })

    return {
        "summary": (
            f"A {available_minutes}-minute plan "
            f"with {len(tasks)} steps."
        ),
        "available_minutes": available_minutes,
        "tasks": tasks,
        "generated_at": datetime.now().isoformat(),
        "mode": "fallback",
    }


def normalize_task_durations(
    tasks: list[GeneratedTask],
    available_minutes: int,
) -> list[dict]:
    """Ensure task durations total exactly the available time."""

    if not tasks:
        raise ValueError("The generated plan contains no tasks.")

    tasks = tasks[:min(6, available_minutes)]

    raw_durations = [task.duration_minutes for task in tasks]
    raw_total = sum(raw_durations)
    task_count = len(tasks)

    remaining = available_minutes
    normalized_tasks = []

    for index, task in enumerate(tasks):
        slots_left = task_count - index - 1

        if slots_left == 0:
            duration = remaining
        else:
            desired = max(
                1,
                round(
                    raw_durations[index]
                    * available_minutes
                    / raw_total
                ),
            )

            duration = min(
                desired,
                remaining - slots_left,
            )

        remaining -= duration

        normalized_tasks.append({
            "title": task.title.strip()[:200],
            "description": task.description.strip()[:1000],
            "duration_minutes": duration,
            "order": index + 1,
        })

    return normalized_tasks


def generate_plan(
    request: str,
    available_minutes: int,
) -> dict:
    """Generate a Gemini plan, falling back on errors."""

    request = request.strip()

    if not request:
        raise ValueError(
            "Please describe what you want to accomplish."
        )

    if not 15 <= available_minutes <= 1440:
        raise ValueError(
            "Available time must be between 15 and 1440 minutes."
        )

    api_key = os.getenv("GEMINI_API_KEY")
    model = os.getenv(
        "GEMINI_MODEL",
        "gemini-3.7-flash",
    )

    if not api_key:
        logger.warning(
            "GEMINI_API_KEY is missing; using fallback planner."
        )
        return generate_fallback_plan(
            request,
            available_minutes,
        )

    prompt = f"""
You are DayPilot AI, a practical productivity planning assistant.

Create a realistic and actionable plan for the user's available time.

USER GOALS:
{request}

AVAILABLE TIME:
{available_minutes} minutes

RULES:
- Return between 1 and 6 tasks.
- Break broad goals into concrete, actionable tasks.
- Prioritize important goals first.
- Give each task a concise title and useful description.
- Estimate realistic task durations.
- Use sequential order values starting at 1.
- Make the total task duration equal exactly
  {available_minutes} minutes.
- Do not claim that work has already been completed.
- Return only data matching the required response schema.
"""

    try:
        with genai.Client(api_key=api_key) as client:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=GeneratedPlan,
                    temperature=0.3,
                    max_output_tokens=1500,
                ),
            )

        if not response.text:
            raise ValueError(
                "Gemini returned an empty planning response."
            )

        generated = GeneratedPlan.model_validate_json(
            response.text
        )

        if not generated.tasks:
            raise ValueError(
                "Gemini did not return any planning tasks."
            )

        normalized_tasks = normalize_task_durations(
            generated.tasks,
            available_minutes,
        )

        total_duration = sum(
            task["duration_minutes"]
            for task in normalized_tasks
        )

        if total_duration != available_minutes:
            raise ValueError(
                "Task durations do not match available time."
            )

        return {
            "summary": generated.summary.strip(),
            "available_minutes": available_minutes,
            "tasks": normalized_tasks,
            "generated_at": datetime.now().isoformat(),
            "mode": "gemini",
        }

    except Exception:
        logger.exception(
            "Gemini planning failed; using fallback planner."
        )

        return generate_fallback_plan(
            request,
            available_minutes,
        )