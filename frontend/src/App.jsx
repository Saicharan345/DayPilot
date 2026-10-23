
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Command,
  Flame,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import "./App.css";

const API_BASE = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const QUICK_PROMPTS = [
  "Prepare for my coding interview",
  "Learn binary trees and solve problems",
  "Build my AI project",
];

// Curated LeetCode catalog. Keep problem URLs in this trusted list rather than
// asking the AI model to invent problem numbers or links.
const LEETCODE_PROBLEMS = {
  trees: [
    {
      id: 104,
      title: "Maximum Depth of Binary Tree",
      difficulty: "Easy",
      topic: "Tree DFS / Recursion",
      url: "https://leetcode.com/problems/maximum-depth-of-binary-tree/",
      minutes: 20,
    },
    {
      id: 226,
      title: "Invert Binary Tree",
      difficulty: "Easy",
      topic: "Tree DFS / Recursion",
      url: "https://leetcode.com/problems/invert-binary-tree/",
      minutes: 20,
    },
    {
      id: 102,
      title: "Binary Tree Level Order Traversal",
      difficulty: "Medium",
      topic: "Tree BFS / Queue",
      url: "https://leetcode.com/problems/binary-tree-level-order-traversal/",
      minutes: 30,
    },
    {
      id: 98,
      title: "Validate Binary Search Tree",
      difficulty: "Medium",
      topic: "Binary Search Tree",
      url: "https://leetcode.com/problems/validate-binary-search-tree/",
      minutes: 30,
    },
    {
      id: 236,
      title: "Lowest Common Ancestor of a Binary Tree",
      difficulty: "Medium",
      topic: "Tree DFS",
      url: "https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-tree/",
      minutes: 35,
    },
    {
      id: 543,
      title: "Diameter of Binary Tree",
      difficulty: "Easy",
      topic: "Tree DFS / Height",
      url: "https://leetcode.com/problems/diameter-of-binary-tree/",
      minutes: 25,
    },
  ],
};

function getRecommendedProblems(text) {
  const normalized = text.toLowerCase();
  if (/\b(tree|trees|binary tree|bst|traversal|diameter of a tree|height of a tree)\b/.test(normalized)) {
    return LEETCODE_PROBLEMS.trees;
  }
  return [];
}

function formatDate() {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function getErrorMessage(error) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function App() {
  const [activeView, setActiveView] = useState("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [request, setRequest] = useState("");
  const [availableMinutes, setAvailableMinutes] = useState(90);
  const [plan, setPlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [busyTaskId, setBusyTaskId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const fetchTasks = useCallback(async (showLoading = true) => {
    if (showLoading) setLoadingTasks(true);

    try {
      const response = await fetch(`${API_BASE}/tasks`);

      if (!response.ok) {
        throw new Error(`Could not load tasks (${response.status}).`);
      }

      const data = await response.json();
      setTasks(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      setError(
        `${getErrorMessage(err)} Make sure your FastAPI backend is running at ${API_BASE}.`,
      );
    } finally {
      if (showLoading) setLoadingTasks(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const completedTasks = useMemo(
    () => tasks.filter((task) => task.completed).length,
    [tasks],
  );

  const totalTasks = tasks.length;
  const remainingTasks = totalTasks - completedTasks;
  const progress = totalTasks
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0;

  const todayLabel = formatDate();
  const recommendedProblems = useMemo(
    () => getRecommendedProblems(`${request} ${plan?.summary || ""} ${(plan?.tasks || []).map((task) => `${task.title} ${task.description || ""}`).join(" ")}`),
    [request, plan],
  );

  async function generatePlan(event) {
    event?.preventDefault();

    if (!request.trim()) {
      setError("Tell DayPilot what you want to accomplish first.");
      return;
    }

    setLoadingPlan(true);
    setError("");
    setNotice("");
    setPlan(null);

    try {
      const response = await fetch(`${API_BASE}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: request.trim(),
          available_minutes: availableMinutes,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || `Plan generation failed (${response.status}).`,
        );
      }

      if (!Array.isArray(data.tasks)) {
        throw new Error("The planner returned an unexpected response.");
      }

      setPlan(data);
      setNotice(
        data.mode === "gemini"
          ? "Your personalized AI plan is ready."
          : "Your basic plan is ready. The AI service may be temporarily unavailable.",
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingPlan(false);
    }
  }

  async function savePlan() {
    if (!plan) return;

    setSavingPlan(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API_BASE}/plan/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || `Could not save the plan (${response.status}).`,
        );
      }

      await fetchTasks(false);
      setNotice("Plan saved successfully. Your tasks are in your workspace.");
      setActiveView("tasks");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingPlan(false);
    }
  }

  async function toggleTask(task) {
    setBusyTaskId(task.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API_BASE}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !task.completed }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || `Could not update task (${response.status}).`,
        );
      }

      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? { ...item, ...data, completed: !task.completed }
            : item,
        ),
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyTaskId(null);
    }
  }

  async function deleteTask(taskId) {
    setBusyTaskId(taskId);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.detail || `Could not delete task (${response.status}).`,
        );
      }

      setTasks((current) => current.filter((task) => task.id !== taskId));
      setNotice("Task removed from your workspace.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyTaskId(null);
    }
  }

  function choosePrompt(prompt) {
    setRequest(prompt);
    setError("");
    document.getElementById("planner-input")?.focus();
  }

  function navigate(view) {
    setActiveView(view);
    setMobileMenuOpen(false);
    setError("");
  }

  const navigation = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "planner", label: "AI Planner", icon: BrainCircuit },
    { id: "tasks", label: "My Tasks", icon: CheckCircle2 },
  ];

  return (
    <div className="app-shell">
      {mobileMenuOpen && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <a
          className="brand"
          href="#overview"
          onClick={() => navigate("overview")}
        >
          <span className="brand-mark">
            <Sparkles size={22} />
          </span>
          <span className="brand-copy">
            <strong>daypilot<span>.ai</span></strong>
            <small>YOUR PERSONAL AI PLANNER</small>
          </span>
        </a>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${activeView === id ? "nav-item-active" : ""}`}
              onClick={() => navigate(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "tasks" && totalTasks > 0 && (
                <span className="nav-count">{remainingTasks}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-insight">
          <div className="insight-icon">
            <Zap size={17} />
          </div>
          <p className="insight-title">Make every minute count.</p>
          <p className="insight-description">
            Turn big goals into small, achievable steps with AI.
          </p>
          <button
            className="insight-button"
            onClick={() => navigate("planner")}
          >
            Create a plan <ArrowRight size={15} />
          </button>
        </div>

        <div className="sidebar-footer">
          <span className="avatar">DP</span>
          <div className="profile-copy">
            <strong>My workspace</strong>
            <small>Personal productivity</small>
          </div>
          <ChevronDown size={16} className="muted-icon" />
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu-button"
              aria-label="Open navigation"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="breadcrumb">
              <span>Workspace</span>
              <span className="breadcrumb-divider">/</span>
              <strong>
                {navigation.find((item) => item.id === activeView)?.label}
              </strong>
            </div>
          </div>

          <div className="topbar-right">
            <span className="date-label">
              <CalendarDays size={15} /> {todayLabel}
            </span>
            <span className="online-indicator">
              <span /> DAYPILOT
            </span>
          </div>
        </header>

        <div className="page-content">
          {error && (
            <div className="alert alert-error" role="alert">
              <span>{error}</span>
              <button
                className="alert-close"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}

          {notice && !error && (
            <div className="alert alert-success" role="status">
              <CheckCircle2 size={17} />
              <span>{notice}</span>
              <button
                className="alert-close"
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}

          {activeView === "overview" && (
            <section className="page-section">
              <div className="welcome-row">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-dot" /> YOUR DAY, WITH A PLAN
                  </div>
                  <h1>Make today <span>count.</span></h1>
                  <p className="page-subtitle">
                    One clear plan. Less overthinking. More progress.
                  </p>
                </div>
                <button
                  className="button button-primary"
                  onClick={() => navigate("planner")}
                >
                  <Sparkles size={17} /> Plan my day
                </button>
              </div>

              <div className="hero-banner">
                <div className="hero-content">
                  <div className="hero-pill">
                    <WandSparkles size={14} /> AI-POWERED PLANNING
                  </div>
                  <h2>Your goals deserve<br />a <span>better game plan.</span></h2>
                  <p>
                    Tell DayPilot what you need to do and how much time you
                    have. Get a practical, prioritized plan in seconds.
                  </p>
                  <button
                    className="button button-light"
                    onClick={() => navigate("planner")}
                  >
                    Build my plan <ArrowRight size={17} />
                  </button>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="hero-glow" />
                  <div className="hero-center-icon">
                    <BrainCircuit size={49} strokeWidth={1.5} />
                  </div>
                  <div className="floating-chip chip-top">
                    <CheckCircle2 size={15} /> Focus
                  </div>
                  <div className="floating-chip chip-bottom">
                    <Clock3 size={15} /> Time saved
                  </div>
                  <div className="floating-dot dot-one" />
                  <div className="floating-dot dot-two" />
                </div>
              </div>

              <div className="section-heading">
                <div>
                  <h2>Your productivity snapshot</h2>
                  <p>A quick look at the work on your plate.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => fetchTasks()}
                  disabled={loadingTasks}
                >
                  <RefreshCw
                    size={15}
                    className={loadingTasks ? "spin" : ""}
                  />
                  Refresh
                </button>
              </div>

              <div className="stats-grid">
                <StatCard
                  icon={Target}
                  label="Total tasks"
                  value={totalTasks}
                  note="In your workspace"
                  color="purple"
                  trend={<ArrowUpRight size={15} />}
                />
                <StatCard
                  icon={CheckCircle2}
                  label="Completed"
                  value={completedTasks}
                  note="Steps finished"
                  color="green"
                  trend={<Check size={15} />}
                />
                <StatCard
                  icon={Activity}
                  label="Still to do"
                  value={remainingTasks}
                  note="Ready when you are"
                  color="blue"
                  trend={<ArrowDownRight size={15} />}
                />
                <StatCard
                  icon={TrendingUp}
                  label="Completion"
                  value={`${progress}%`}
                  note="Overall progress"
                  color="orange"
                  trend={<Flame size={15} />}
                />
              </div>

              <div className="overview-bottom">
                <div className="panel-card progress-card">
                  <div className="card-heading">
                    <div>
                      <h3>Keep your momentum</h3>
                      <p>Small wins add up to big progress.</p>
                    </div>
                    <span className="card-icon purple-icon">
                      <TrendingUp size={19} />
                    </span>
                  </div>
                  <div className="progress-number-row">
                    <strong>{progress}%</strong>
                    <span>{completedTasks} of {totalTasks} tasks done</span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="progress-footer">
                    {totalTasks === 0
                      ? "Create your first plan to get started."
                      : remainingTasks === 0
                        ? "Amazing! Everything is completed."
                        : `${remainingTasks} task${remainingTasks === 1 ? "" : "s"} left. You've got this.`}
                  </div>
                </div>

                <div className="panel-card focus-card">
                  <div className="card-heading">
                    <div>
                      <h3>Ready to focus?</h3>
                      <p>Let AI decide what to tackle first.</p>
                    </div>
                    <span className="card-icon cyan-icon">
                      <BrainCircuit size={19} />
                    </span>
                  </div>
                  <div className="focus-preview">
                    <div className="focus-preview-icon">
                      <Command size={20} />
                    </div>
                    <div>
                      <strong>Describe your goal</strong>
                      <p>Get a time-aware action plan.</p>
                    </div>
                  </div>
                  <button
                    className="button button-secondary full-button"
                    onClick={() => navigate("planner")}
                  >
                    Open AI planner <ArrowRight size={16} />
                  </button>
                </div>
              </div>

              <TaskPreview
                tasks={tasks}
                loading={loadingTasks}
                onToggle={toggleTask}
                onDelete={deleteTask}
                busyTaskId={busyTaskId}
                onViewAll={() => navigate("tasks")}
              />
            </section>
          )}

          {activeView === "planner" && (
            <section className="page-section">
              <div className="page-intro">
                <div className="eyebrow">
                  <span className="eyebrow-dot" /> YOUR PERSONAL AI
                </div>
                <h1>Meet your <span>AI planner.</span></h1>
                <p className="page-subtitle">
                  Describe your goal. Set your time. Get a plan you can actually follow.
                </p>
              </div>

              <div className="planner-layout">
                <div className="panel-card planner-form-card">
                  <div className="form-title-row">
                    <div className="card-icon purple-icon large-icon">
                      <Sparkles size={22} />
                    </div>
                    <div>
                      <h2>What do you want to accomplish?</h2>
                      <p>Be specific. DayPilot will break it down for you.</p>
                    </div>
                  </div>

                  <form onSubmit={generatePlan}>
                    <label className="field-label" htmlFor="planner-input">
                      YOUR GOAL
                    </label>
                    <textarea
                      id="planner-input"
                      className="planner-textarea"
                      value={request}
                      onChange={(event) => setRequest(event.target.value)}
                      placeholder="e.g. Prepare for a coding interview by revising binary trees and solving two problems..."
                      rows={5}
                      maxLength={2000}
                    />

                    <div className="textarea-footer">
                      <span>Describe the outcome you want.</span>
                      <span>{request.length}/2000</span>
                    </div>

                    <label className="field-label quick-label">
                      NEED AN IDEA?
                    </label>
                    <div className="quick-prompts">
                      {QUICK_PROMPTS.map((prompt) => (
                        <button
                          type="button"
                          key={prompt}
                          className="prompt-chip"
                          onClick={() => choosePrompt(prompt)}
                        >
                          <Plus size={14} /> {prompt}
                        </button>
                      ))}
                    </div>

                    <div className="time-selector">
                      <div className="time-selector-top">
                        <div>
                          <label className="field-label" htmlFor="time-range">
                            AVAILABLE TIME
                          </label>
                          <p>How long can you focus right now?</p>
                        </div>
                        <div className="time-value">
                          <strong>{availableMinutes}</strong>
                          <span>minutes</span>
                        </div>
                      </div>

                      <input
                        id="time-range"
                        className="time-range"
                        type="range"
                        min="15"
                        max="240"
                        step="15"
                        value={availableMinutes}
                        onChange={(event) =>
                          setAvailableMinutes(Number(event.target.value))
                        }
                      />

                      <div className="range-labels">
                        <span>15 min</span>
                        <span>2 hours</span>
                        <span>4 hours</span>
                      </div>
                    </div>

                    <button
                      className="button button-primary generate-button"
                      type="submit"
                      disabled={loadingPlan || !request.trim()}
                    >
                      {loadingPlan ? (
                        <>
                          <LoaderCircle className="spin" size={18} />
                          Building your plan...
                        </>
                      ) : (
                        <>
                          <WandSparkles size={18} />
                          Generate my plan
                          <ArrowRight size={17} />
                        </>
                      )}
                    </button>
                  </form>
                </div>

                <div className="planner-side">
                  <div className="panel-card how-card">
                    <div className="card-icon cyan-icon large-icon">
                      <BrainCircuit size={22} />
                    </div>
                    <h3>Planning that thinks ahead.</h3>
                    <p>
                      DayPilot turns an overwhelming goal into manageable
                      steps, organized around your available time.
                    </p>
                    <div className="how-step">
                      <span>01</span>
                      <div>
                        <strong>Understand</strong>
                        <p>Start with your real goal.</p>
                      </div>
                    </div>
                    <div className="how-step">
                      <span>02</span>
                      <div>
                        <strong>Break it down</strong>
                        <p>Get focused, actionable tasks.</p>
                      </div>
                    </div>
                    <div className="how-step">
                      <span>03</span>
                      <div>
                        <strong>Make progress</strong>
                        <p>Save tasks and track completion.</p>
                      </div>
                    </div>
                  </div>

                  <div className="tip-card">
                    <Zap size={19} />
                    <div>
                      <strong>Pro tip</strong>
                      <p>
                        Mention a deadline, topic, or deliverable to get a
                        more useful plan.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {plan && (
                <div className="generated-plan panel-card">
                  <div className="generated-plan-header">
                    <div>
                      <div className="eyebrow">
                        <span className="eyebrow-dot" /> PLAN READY
                      </div>
                      <h2>{plan.summary || "Your action plan"}</h2>
                      <p>
                        {plan.tasks.length} planned steps
                        {plan.available_minutes
                          ? ` · ${plan.available_minutes} minutes available`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={`ai-status ${plan.mode === "gemini" ? "ai-status-active" : ""}`}
                    >
                      <Sparkles size={14} />
                      {plan.mode === "gemini" ? "AI generated" : "Basic plan"}
                    </span>
                  </div>

                  <div className="plan-timeline">
                    {plan.tasks.map((task, index) => (
                      <div className="plan-step" key={`${task.title}-${index}`}>
                        <div className="plan-step-marker">
                          <span>{String(index + 1).padStart(2, "0")}</span>
                        </div>
                        <div className="plan-step-body">
                          <div className="plan-step-title-row">
                            <h3>{task.title}</h3>
                            <span className="duration-tag">
                              <Clock3 size={13} />
                              {task.duration_minutes ?? "—"} min
                            </span>
                          </div>
                          <p>{task.description || "Work on this step."}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {recommendedProblems.length > 0 && (
                    <>
                      <style>{`
                        .leetcode-section { margin-top: 30px; padding-top: 26px; border-top: 1px solid var(--border-color, rgba(255,255,255,.1)); }
                        .leetcode-section-heading { display: flex; justify-content: space-between; align-items: flex-end; gap: 18px; margin-bottom: 18px; }
                        .leetcode-section-heading h3 { margin: 10px 0 6px; font-size: 1.2rem; }
                        .leetcode-section-heading p { margin: 0; color: var(--text-muted, #9292a8); line-height: 1.6; font-size: .9rem; }
                        .leetcode-count { flex: 0 0 auto; padding: 7px 10px; border: 1px solid rgba(167,139,250,.25); border-radius: 10px; color: #c4b5fd; font-size: .8rem; }
                        .leetcode-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
                        .leetcode-card { min-width: 0; padding: 17px; border: 1px solid rgba(167,139,250,.18); border-radius: 15px; background: rgba(255,255,255,.018); transition: border-color .2s ease, transform .2s ease; }
                        .leetcode-card:hover { border-color: rgba(167,139,250,.5); transform: translateY(-2px); }
                        .leetcode-card-top, .leetcode-card-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
                        .leetcode-number { font-size: .8rem; color: #c4b5fd; font-weight: 700; }
                        .leetcode-difficulty { padding: 4px 8px; border-radius: 7px; font-size: .72rem; font-weight: 700; }
                        .difficulty-easy { color: #6ee7b7; background: rgba(16,185,129,.12); }
                        .difficulty-medium { color: #fcd34d; background: rgba(245,158,11,.12); }
                        .difficulty-hard { color: #fca5a5; background: rgba(239,68,68,.12); }
                        .leetcode-card h4 { margin: 14px 0 7px; font-size: .98rem; line-height: 1.45; color: var(--text-primary, #eeeaf7); }
                        .leetcode-topic { margin: 0 0 17px; color: var(--text-muted, #9292a8); font-size: .8rem; }
                        .leetcode-card-footer { padding-top: 13px; border-top: 1px solid rgba(255,255,255,.07); font-size: .78rem; }
                        .leetcode-card-footer > span, .leetcode-card-footer a { display: inline-flex; align-items: center; gap: 6px; }
                        .leetcode-card-footer > span { color: var(--text-muted, #9292a8); white-space: nowrap; }
                        .leetcode-card-footer a { color: #c4b5fd; font-weight: 700; text-decoration: none; }
                        .leetcode-card-footer a:hover { color: #e9d5ff; text-decoration: underline; }
                        @media (max-width: 700px) { .leetcode-grid { grid-template-columns: 1fr; } .leetcode-section-heading { align-items: flex-start; flex-direction: column; } }
                      `}</style>
                      <section className="leetcode-section" aria-labelledby="leetcode-heading">
                      <div className="leetcode-section-heading">
                        <div>
                          <div className="eyebrow">
                            <span className="eyebrow-dot" /> PRACTICE NEXT
                          </div>
                          <h3 id="leetcode-heading">Recommended LeetCode problems</h3>
                          <p>Curated links matched to your tree study plan. Open a problem in a new tab.</p>
                        </div>
                        <span className="leetcode-count">{recommendedProblems.length} problems</span>
                      </div>
                      <div className="leetcode-grid">
                        {recommendedProblems.map((problem) => (
                          <article className="leetcode-card" key={problem.id}>
                            <div className="leetcode-card-top">
                              <span className="leetcode-number">#{problem.id}</span>
                              <span className={`leetcode-difficulty difficulty-${problem.difficulty.toLowerCase()}`}>
                                {problem.difficulty}
                              </span>
                            </div>
                            <h4>{problem.title}</h4>
                            <p className="leetcode-topic">{problem.topic}</p>
                            <div className="leetcode-card-footer">
                              <span><Clock3 size={13} /> {problem.minutes} min</span>
                              <a href={problem.url} target="_blank" rel="noopener noreferrer">
                                Open on LeetCode <ArrowUpRight size={14} />
                              </a>
                            </div>
                          </article>
                        ))}
                      </div>
                      </section>
                    </>
                  )}

                  <div className="plan-footer">
                    <p>
                      <CheckCircle2 size={16} />
                      Ready to turn this plan into trackable tasks?
                    </p>
                    <button
                      className="button button-primary"
                      onClick={savePlan}
                      disabled={savingPlan || plan.tasks.length === 0}
                    >
                      {savingPlan ? (
                        <>
                          <LoaderCircle className="spin" size={17} />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check size={17} /> Save to my tasks
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {activeView === "tasks" && (
            <section className="page-section">
              <div className="welcome-row">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-dot" /> YOUR WORKSPACE
                  </div>
                  <h1>Make progress, <span>one task at a time.</span></h1>
                  <p className="page-subtitle">
                    Every completed task is a step toward your goal.
                  </p>
                </div>
                <button
                  className="button button-primary"
                  onClick={() => navigate("planner")}
                >
                  <Plus size={17} /> New plan
                </button>
              </div>

              <div className="task-summary-strip">
                <div>
                  <span className="summary-strip-label">TOTAL TASKS</span>
                  <strong>{totalTasks}</strong>
                </div>
                <div>
                  <span className="summary-strip-label">COMPLETED</span>
                  <strong className="text-green">{completedTasks}</strong>
                </div>
                <div>
                  <span className="summary-strip-label">REMAINING</span>
                  <strong>{remainingTasks}</strong>
                </div>
                <div className="summary-progress">
                  <div className="summary-progress-label">
                    <span>Overall progress</span>
                    <strong>{progress}%</strong>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="section-heading task-heading">
                <div>
                  <h2>Your task list</h2>
                  <p>Check off tasks as you complete them.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => fetchTasks()}
                  disabled={loadingTasks}
                >
                  <RefreshCw
                    size={15}
                    className={loadingTasks ? "spin" : ""}
                  />
                  Refresh
                </button>
              </div>

              {loadingTasks ? (
                <div className="empty-state">
                  <LoaderCircle className="spin" size={28} />
                  <h3>Loading your tasks...</h3>
                </div>
              ) : tasks.length === 0 ? (
                <div className="empty-state panel-card">
                  <div className="empty-icon">
                    <CheckCircle2 size={28} />
                  </div>
                  <h3>Your workspace starts here.</h3>
                  <p>
                    Generate your first AI plan and save it to see your tasks here.
                  </p>
                  <button
                    className="button button-primary"
                    onClick={() => navigate("planner")}
                  >
                    <Sparkles size={17} /> Create my first plan
                  </button>
                </div>
              ) : (
                <div className="task-list">
                  {tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      busy={busyTaskId === task.id}
                      onToggle={() => toggleTask(task)}
                      onDelete={() => deleteTask(task.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          <footer className="page-footer">
            <span>DAYPILOT AI</span>
            <span>Plan smarter. Do more. Find your flow.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, note, color, trend }) {
  return (
    <div className="stat-card">
      <div className="stat-top-row">
        <span className={`stat-icon ${color}-icon`}>
          <Icon size={19} />
        </span>
        <span className={`stat-trend ${color}-trend`}>{trend}</span>
      </div>
      <p className="stat-label">{label}</p>
      <strong className="stat-value">{value}</strong>
      <span className="stat-note">{note}</span>
    </div>
  );
}

function TaskRow({ task, busy, onToggle, onDelete }) {
  return (
    <div className={`task-row ${task.completed ? "task-row-completed" : ""}`}>
      <button
        className={`task-check ${task.completed ? "task-check-done" : ""}`}
        aria-label={task.completed ? "Mark task incomplete" : "Complete task"}
        onClick={onToggle}
        disabled={busy}
      >
        {busy ? (
          <LoaderCircle className="spin" size={17} />
        ) : task.completed ? (
          <Check size={16} />
        ) : (
          <Circle size={20} />
        )}
      </button>
      <div className="task-row-copy">
        <h3>{task.title}</h3>
        {task.description && <p>{task.description}</p>}
        <span className="task-row-meta">
          <Clock3 size={13} />
          {task.completed ? "Completed" : "In your task list"}
        </span>
      </div>
      <span
        className={`task-status ${task.completed ? "task-status-done" : ""}`}
      >
        {task.completed ? "Done" : "To do"}
      </span>
      <button
        className="icon-button delete-button"
        aria-label={`Delete ${task.title}`}
        title="Delete task"
        onClick={onDelete}
        disabled={busy}
      >
        <Trash2 size={17} />
      </button>
    </div>
  );
}

function TaskPreview({
  tasks,
  loading,
  onToggle,
  onDelete,
  busyTaskId,
  onViewAll,
}) {
  const previewTasks = tasks.slice(0, 4);

  return (
    <div className="recent-section">
      <div className="section-heading">
        <div>
          <h2>Up next</h2>
          <p>Your latest tasks, all in one place.</p>
        </div>
        <button className="text-button" onClick={onViewAll}>
          View all <ArrowRight size={15} />
        </button>
      </div>

      {loading ? (
        <div className="empty-state compact-empty">
          <LoaderCircle className="spin" size={22} />
          <p>Loading tasks...</p>
        </div>
      ) : previewTasks.length === 0 ? (
        <div className="panel-card empty-preview">
          <div className="empty-icon">
            <CalendarDays size={23} />
          </div>
          <div>
            <h3>No tasks yet</h3>
            <p>Create an AI plan to get your day moving.</p>
          </div>
          <button className="button button-secondary" onClick={onViewAll}>
            View workspace <ArrowRight size={15} />
          </button>
        </div>
      ) : (
        <div className="task-list">
          {previewTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              busy={busyTaskId === task.id}
              onToggle={() => onToggle(task)}
              onDelete={() => onDelete(task.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
