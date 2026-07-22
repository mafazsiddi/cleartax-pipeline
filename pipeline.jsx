import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, Search, X, Trash2, Pencil, Calendar, Link2, Users,
  ExternalLink, AlertTriangle, Check, LayoutGrid, UserPlus, LogOut,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.NEXT_PUBLIC_cleartaxpipeline_SUPABASE_URL || "https://ynwvhxvvuziacldhdzfg.supabase.co";
const supabaseAnonKey = import.meta.env.NEXT_PUBLIC_cleartaxpipeline_SUPABASE_PUBLISHABLE_KEY || "";

const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

/* ------------------------------------------------------------------ *
 * Pipeline — an internal board for a page design + development team.
 * Data is shared across everyone who opens this tool (window.storage,
 * shared=true), so the whole team sees and edits the same board.
 * ------------------------------------------------------------------ */

const STAGES = [
  { id: "backlog", name: "Backlog", color: "var(--s-backlog)" },
  { id: "design", name: "Design", color: "var(--s-design)" },
  { id: "design_review", name: "Design Review", color: "var(--s-review)" },
  { id: "development", name: "Development", color: "var(--s-dev)" },
  { id: "qa", name: "QA", color: "var(--s-qa)" },
  { id: "done", name: "Done", color: "var(--s-done)" },
];

const PRIORITIES = [
  { id: "urgent", name: "Urgent", color: "var(--p-urgent)", rank: 0 },
  { id: "high", name: "High", color: "var(--p-high)", rank: 1 },
  { id: "medium", name: "Medium", color: "var(--p-medium)", rank: 2 },
  { id: "low", name: "Low", color: "var(--p-low)", rank: 3 },
];
const PMAP = Object.fromEntries(PRIORITIES.map((p) => [p.id, p]));
const PRANK = Object.fromEntries(PRIORITIES.map((p) => [p.id, p.rank]));

const AVATAR_COLORS = [
  "#4338CA", "#0E7490", "#B45309", "#9333EA",
  "#BE185D", "#15803D", "#2563EB", "#7C3AED",
];

/* ----------------------------- storage ---------------------------- */
const K_TASKS = "pipeline:tasks:v1";
const K_MEMBERS = "pipeline:members:v1";
const K_INIT = "pipeline:initialized:v1";

function getStore() {
  if (typeof window !== "undefined" && window.storage && typeof window.storage.get === "function") {
    return {
      get: async (k) => {
        const res = await window.storage.get(k, true);
        return res && res.value != null ? res.value : null;
      },
      set: async (k, v) => {
        await window.storage.set(k, v, true);
      }
    };
  }
  if (typeof window !== "undefined" && window.localStorage) {
    return {
      get: async (k) => window.localStorage.getItem(k),
      set: async (k, v) => window.localStorage.setItem(k, v)
    };
  }
  return null;
}

async function loadKey(key, fallback) {
  const store = getStore();
  if (!store) return fallback;
  try {
    const val = await store.get(key);
    return val != null ? JSON.parse(val) : fallback;
  } catch {
    return fallback;
  }
}

async function saveKey(key, value) {
  const store = getStore();
  if (!store) return;
  try {
    await store.set(key, JSON.stringify(value));
  } catch (e) {
    console.error("save failed", key, e);
  }
}

/* ------------------------------ helpers --------------------------- */
const uid = () =>
  `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function initials(name) {
  if (!name) return "?";
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "?";
}
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function dueMeta(due, isDone) {
  if (!due) return null;
  const t = new Date(todayStr() + "T00:00:00");
  const d = new Date(due + "T00:00:00");
  const diff = Math.round((d - t) / 86400000);
  const short = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (isDone) return { label: short, state: "normal" };
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, state: "overdue" };
  if (diff === 0) return { label: "Due today", state: "today" };
  if (diff === 1) return { label: "Due tomorrow", state: "soon" };
  if (diff <= 3) return { label: `Due in ${diff}d`, state: "soon" };
  return { label: short, state: "normal" };
}
function sortTasks(a, b) {
  const pa = PRANK[a.priority] ?? 9,
    pb = PRANK[b.priority] ?? 9;
  if (pa !== pb) return pa - pb;
  const da = a.dueDate || "9999-99-99",
    db = b.dueDate || "9999-99-99";
  if (da !== db) return da < db ? -1 : 1;
  return (a.createdAt || 0) - (b.createdAt || 0);
}

/* ------------------------------- seed ----------------------------- */
const SEED_MEMBERS = [];
const SEED_TASKS = [];
function buildSeed() {
  const now = Date.now();
  return SEED_TASKS.map((t, i) => ({
    id: uid(),
    title: t.title,
    description: t.description,
    assignee: t.assignee,
    priority: t.priority,
    dueDate: t.due == null ? "" : offsetDate(t.due),
    figmaLink: t.figmaLink,
    stage: t.stage,
    createdAt: now + i,
  }));
}

/* =================================================================== */
function LoginScreen({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validateEmailDomain = (emailStr) => {
    const domain = emailStr.trim().split("@")[1];
    if (!domain) return false;
    const allowed = ["clear.in", "cleartax.in", "cleartax.com"];
    return allowed.includes(domain.toLowerCase());
  };

  const handleAuthorize = async (e) => {
    e.preventDefault();
    setError("");
    const trimmed = email.trim();
    if (!trimmed) return setError("Please enter your email address.");
    if (!validateEmailDomain(trimmed)) {
      return setError("Please enter your email address.");
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/authorize-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch (jsonErr) {
        const text = await res.text();
        setError(`Server error (${res.status}): ${text.slice(0, 150)}`);
        return;
      }
      if (!res.ok) {
        setError(data.error || "Failed to authorize email.");
      } else {
        localStorage.setItem("pipeline_session", JSON.stringify(data));
        onLoginSuccess(data);
      }
    } catch (err) {
      setError(`Network/unexpected error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "radial-gradient(circle at 10% 20%, rgb(87, 108, 117) 0%, rgb(37, 50, 55) 100.2%)",
      fontFamily: "'Space Grotesk', sans-serif",
      padding: "20px",
    }}>
      <div style={{
        background: "rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(20px)",
        borderRadius: "24px",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        width: "100%",
        maxWidth: "420px",
        padding: "40px 32px",
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
        textAlign: "center",
      }}>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "64px",
          height: "64px",
          borderRadius: "16px",
          background: "linear-gradient(135deg, #4F46E5 0%, #06B6D4 100%)",
          marginBottom: "24px",
          color: "white",
        }}>
          <LayoutGrid size={32} />
        </div>
        <h2 style={{
          fontSize: "28px",
          fontWeight: "700",
          color: "white",
          margin: "0 0 8px 0",
          letterSpacing: "-0.5px",
        }}>
          Pipeline
        </h2>
        <p style={{
          fontSize: "14px",
          color: "rgba(255, 255, 255, 0.6)",
          margin: "0 0 32px 0",
          lineHeight: "1.5",
        }}>
          Team Kanban Board
        </p>

        {error && (
          <div style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: "12px",
            padding: "12px 16px",
            color: "#FCA5A5",
            fontSize: "13px",
            textAlign: "left",
            marginBottom: "20px",
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleAuthorize}>
          <div style={{ textAlign: "left", marginBottom: "20px" }}>
            <label style={{
              display: "block",
              fontSize: "12px",
              fontWeight: "600",
              color: "rgba(255, 255, 255, 0.8)",
              marginBottom: "8px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}>
              Email Address
            </label>
            <input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "12px",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                background: "rgba(255, 255, 255, 0.05)",
                color: "white",
                fontSize: "15px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "12px",
              border: "none",
              background: "linear-gradient(135deg, #4F46E5 0%, #06B6D4 100%)",
              color: "white",
              fontSize: "15px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Verifying..." : "Access Board"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [fAssignee, setFAssignee] = useState("all");
  const [fPriority, setFPriority] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTask, setModalTask] = useState(null); // null = create
  const [modalStage, setModalStage] = useState("backlog");
  const [teamOpen, setTeamOpen] = useState(false);

  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const [apiConnected, setApiConnected] = useState(false);

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const emailParam = params.get("email");
      const tokenParam = params.get("token");

      if (emailParam && tokenParam) {
        try {
          const res = await fetch("/api/auth/verify-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: emailParam, token: tokenParam })
          });
          if (res.ok) {
            const data = await res.json();
            localStorage.setItem("pipeline_session", JSON.stringify(data));
            setSession(data);
            window.history.replaceState({}, document.title, window.location.pathname);
            setAuthLoading(false);
            return;
          }
        } catch (e) {
          console.error("Magic link verification failed:", e);
        }
      }

      const stored = localStorage.getItem("pipeline_session");
      if (stored) {
        try {
          setSession(JSON.parse(stored));
        } catch (e) {
          localStorage.removeItem("pipeline_session");
        }
      }
      setAuthLoading(false);
    })();
  }, []);

  const handleLogout = async () => {
    try {
      const token = session?.token;
      if (token) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` }
        });
      }
    } catch (e) {
      console.error("Logout error", e);
    }
    localStorage.removeItem("pipeline_session");
    setSession(null);
  };

  /* ---- load ---- */
  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      setLoading(true);
      let apiSuccess = false;
      // 1. Try API Server first
      try {
        const headers = {};
        if (session?.token) {
          headers["Authorization"] = `Bearer ${session.token}`;
        }
        const res = await fetch("/api/board", { headers });
        if (res.ok) {
          const data = await res.json();
          if (alive && data && Array.isArray(data.tasks)) {
            setTasks(data.tasks);
            setMembers(Array.isArray(data.members) ? data.members : SEED_MEMBERS);
            setApiConnected(true);
            setLoading(false);
            apiSuccess = true;
          }
        }
      } catch (e) {
        console.error("API server connection failed:", e);
      }

      if (apiSuccess) return;

      // 2. Storage or seed fallback
      const store = getStore();
      if (!store) {
        if (alive) {
          setTasks(buildSeed());
          setMembers(SEED_MEMBERS);
          setLoading(false);
        }
        return;
      }
      const inited = await loadKey(K_INIT, false);
      if (!inited) {
        const seed = buildSeed();
        if (!alive) return;
        setTasks(seed);
        setMembers(SEED_MEMBERS);
        setLoading(false);
        await saveKey(K_TASKS, seed);
        await saveKey(K_MEMBERS, SEED_MEMBERS);
        await saveKey(K_INIT, true);
        return;
      }
      const [t, m] = await Promise.all([
        loadKey(K_TASKS, []),
        loadKey(K_MEMBERS, SEED_MEMBERS),
      ]);
      if (!alive) return;
      setTasks(Array.isArray(t) ? t : []);
      setMembers(Array.isArray(m) ? m : SEED_MEMBERS);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [authLoading, session]);

  /* ---- persistence-wrapped setters ---- */
  const persistTasks = (next) => {
    setTasks(next);
    if (!apiConnected) saveKey(K_TASKS, next);
  };
  const persistMembers = (next) => {
    setMembers(next);
    if (!apiConnected) saveKey(K_MEMBERS, next);
  };

  /* ---- mutations ---- */
  const upsertTask = async (task) => {
    const exists = tasks.some((t) => t.id === task.id);
    const next = exists ? tasks.map((t) => (t.id === task.id ? task : t)) : [...tasks, task];
    persistTasks(next);
    if (apiConnected) {
      try {
        const headers = { "Content-Type": "application/json" };
        if (session?.token) {
          headers["Authorization"] = `Bearer ${session.token}`;
        }
        await fetch("/api/tasks", {
          method: "POST",
          headers,
          body: JSON.stringify(task),
        });
      } catch (e) {
        console.error("Failed to save task to backend", e);
      }
    }
  };

  const deleteTask = async (id) => {
    persistTasks(tasks.filter((t) => t.id !== id));
    if (apiConnected) {
      try {
        const headers = {};
        if (session?.token) {
          headers["Authorization"] = `Bearer ${session.token}`;
        }
        await fetch(`/api/tasks/${id}`, { method: "DELETE", headers });
      } catch (e) {
        console.error("Failed to delete task from backend", e);
      }
    }
  };

  const moveTask = async (id, stage) => {
    persistTasks(tasks.map((t) => (t.id === id ? { ...t, stage } : t)));
    if (apiConnected) {
      try {
        const headers = { "Content-Type": "application/json" };
        if (session?.token) {
          headers["Authorization"] = `Bearer ${session.token}`;
        }
        await fetch(`/api/tasks/${id}/stage`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ stage }),
        });
      } catch (e) {
        console.error("Failed to move task stage in backend", e);
      }
    }
  };

  const addMember = async (name) => {
    const n = name.trim();
    if (!n || members.some((m) => m.toLowerCase() === n.toLowerCase())) return;
    persistMembers([...members, n]);
    if (apiConnected) {
      try {
        const headers = { "Content-Type": "application/json" };
        if (session?.token) {
          headers["Authorization"] = `Bearer ${session.token}`;
        }
        await fetch("/api/members", {
          method: "POST",
          headers,
          body: JSON.stringify({ name: n }),
        });
      } catch (e) {
        console.error("Failed to add member in backend", e);
      }
    }
  };

  const removeMember = async (name) => {
    persistMembers(members.filter((m) => m !== name));
    persistTasks(tasks.map((t) => (t.assignee === name ? { ...t, assignee: "" } : t)));
    if (apiConnected) {
      try {
        const headers = {};
        if (session?.token) {
          headers["Authorization"] = `Bearer ${session.token}`;
        }
        await fetch(`/api/members/${encodeURIComponent(name)}`, { method: "DELETE", headers });
      } catch (e) {
        console.error("Failed to remove member in backend", e);
      }
    }
  };

  const clearBoard = async () => {
    if (window.confirm("Remove every card from the board? This can't be undone.")) {
      persistTasks([]);
      if (apiConnected) {
        try {
          const headers = {};
          if (session?.token) {
            headers["Authorization"] = `Bearer ${session.token}`;
          }
          await fetch("/api/clear", { method: "POST", headers });
        } catch (e) {
          console.error("Failed to clear tasks in backend", e);
        }
      }
    }
  };

  /* ---- escape closes modals ---- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setModalOpen(false);
        setTeamOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---- derived ---- */
  const filtersActive = query.trim() || fAssignee !== "all" || fPriority !== "all";
  const visible = useMemo(
    () =>
      tasks.filter((t) => {
        if (fAssignee !== "all") {
          if (fAssignee === "__none") {
            if (t.assignee) return false;
          } else if (t.assignee !== fAssignee) return false;
        }
        if (fPriority !== "all" && t.priority !== fPriority) return false;
        if (query.trim()) {
          const q = query.toLowerCase();
          if (
            !t.title.toLowerCase().includes(q) &&
            !(t.description || "").toLowerCase().includes(q)
          )
            return false;
        }
        return true;
      }),
    [tasks, fAssignee, fPriority, query]
  );
  const byStage = useMemo(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s.id, []]));
    visible.forEach((t) => (map[t.stage] || map.backlog).push(t));
    Object.values(map).forEach((arr) => arr.sort(sortTasks));
    return map;
  }, [visible]);
  const overdueCount = useMemo(
    () =>
      tasks.filter((t) => t.stage !== "done" && t.dueDate && t.dueDate < todayStr()).length,
    [tasks]
  );

  /* ---- drag/drop ---- */
  const onCardDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", id);
    } catch {}
  };
  const onColDragOver = (e, stage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOver !== stage) setDragOver(stage);
  };
  const onColDrop = (e, stage) => {
    e.preventDefault();
    const id = dragId || (e.dataTransfer && e.dataTransfer.getData("text/plain"));
    if (id) moveTask(id, stage);
    setDragOver(null);
    setDragId(null);
  };
  const endDrag = () => {
    setDragOver(null);
    setDragId(null);
  };

  /* ---- open compose ---- */
  const openCreate = (stage = "backlog") => {
    setModalTask(null);
    setModalStage(stage);
    setModalOpen(true);
  };
  const openEdit = (task) => {
    setModalTask(task);
    setModalStage(task.stage);
    setModalOpen(true);
  };

  if (authLoading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(circle at 10% 20%, rgb(87, 108, 117) 0%, rgb(37, 50, 55) 100.2%)",
        color: "white",
        fontFamily: "'Space Grotesk', sans-serif"
      }}>
        <div className="spinner" style={{ borderTopColor: "#4F46E5", width: "40px", height: "40px", borderWidth: "3px" }} />
        <div style={{ marginTop: "16px", fontSize: "14px", opacity: 0.8 }}>Authenticating session...</div>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen onLoginSuccess={setSession} />;
  }

  return (
    <div className="app">
      <style>{CSS}</style>

      {/* ---------- top bar ---------- */}
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            <LayoutGrid size={16} strokeWidth={2.4} />
          </span>
          <div className="brand-txt">
            <h1>Pipeline</h1>
            <span className="brand-sub">Design &amp; development board</span>
          </div>
        </div>

        <div className="tools">
          <div className="searchbox">
            <Search size={15} className="search-ic" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cards"
              aria-label="Search cards"
            />
            {query && (
              <button className="search-clear" onClick={() => setQuery("")} aria-label="Clear search">
                <X size={13} />
              </button>
            )}
          </div>

          <div className="selwrap">
            <select
              className="sel"
              value={fAssignee}
              onChange={(e) => setFAssignee(e.target.value)}
              aria-label="Filter by assignee"
            >
              <option value="all">Everyone</option>
              <option value="__none">Unassigned</option>
              {members.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="selwrap">
            <select
              className="sel"
              value={fPriority}
              onChange={(e) => setFPriority(e.target.value)}
              aria-label="Filter by priority"
            >
              <option value="all">Any priority</option>
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {overdueCount > 0 && (
            <span className="overdue-pill" title="Cards past their due date">
              <AlertTriangle size={12} strokeWidth={2.4} />
              {overdueCount} overdue
            </span>
          )}

          {session && (
            <button className="btn ghost" onClick={handleLogout} style={{ color: "#EF4444", borderColor: "rgba(239, 68, 68, 0.2)" }} title={`Logged in as ${session.email}`}>
              <LogOut size={15} />
              <span className="btn-lbl">Log Out</span>
            </button>
          )}

          <button className="btn ghost" onClick={() => setTeamOpen(true)}>
            <Users size={15} />
            <span className="btn-lbl">Team</span>
          </button>
          <button className="btn primary" onClick={() => openCreate("backlog")}>
            <Plus size={16} strokeWidth={2.4} />
            New task
          </button>
        </div>
      </header>

      {!apiConnected && (
        <div className="notice" style={{ background: "#FEF3C7", color: "#92400E", borderColor: "#FDE68A" }}>
          ⚠️ Offline Mode — Syncing with local browser storage instead of database.
        </div>
      )}

      {/* ---------- board ---------- */}
      {loading ? (
        <div className="loading">
          <div className="spinner" />
          Loading the board…
        </div>
      ) : (
        <div className="board">
          {STAGES.map((s) => {
            const cards = byStage[s.id] || [];
            return (
              <section
                key={s.id}
                className={`col ${dragOver === s.id ? "drop" : ""}`}
                onDragOver={(e) => onColDragOver(e, s.id)}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null);
                }}
                onDrop={(e) => onColDrop(e, s.id)}
              >
                <div className="col-head">
                  <span className="dot" style={{ background: s.color }} />
                  <span className="col-name">{s.name}</span>
                  <span className="col-count">{cards.length}</span>
                </div>

                <div className="col-body">
                  {cards.map((t) => (
                    <Card
                      key={t.id}
                      task={t}
                      dragging={dragId === t.id}
                      onEdit={() => openEdit(t)}
                      onDragStart={(e) => onCardDragStart(e, t.id)}
                      onDragEnd={endDrag}
                    />
                  ))}
                  {cards.length === 0 && (
                    <div className="empty">
                      {filtersActive ? "No matches here" : "Nothing yet"}
                    </div>
                  )}
                </div>

                <button className="col-add" onClick={() => openCreate(s.id)}>
                  <Plus size={14} /> Add card
                </button>
              </section>
            );
          })}
        </div>
      )}

      {/* ---------- modals ---------- */}
      {modalOpen && (
        <TaskModal
          key={modalTask ? modalTask.id : "new"}
          initial={modalTask}
          defaultStage={modalStage}
          members={members}
          onClose={() => setModalOpen(false)}
          onSave={(task) => {
            upsertTask(task);
            setModalOpen(false);
          }}
          onDelete={(id) => {
            deleteTask(id);
            setModalOpen(false);
          }}
        />
      )}

      {teamOpen && (
        <TeamModal
          members={members}
          tasks={tasks}
          onAdd={addMember}
          onRemove={removeMember}
          onClear={clearBoard}
          onClose={() => setTeamOpen(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------- Card ----------------------------- */
function Card({ task, dragging, onEdit, onDragStart, onDragEnd }) {
  const p = PMAP[task.priority] || PMAP.medium;
  const isDone = task.stage === "done";
  const due = dueMeta(task.dueDate, isDone);
  return (
    <article
      className={`card ${dragging ? "is-dragging" : ""}`}
      style={{ "--spine": p.color }}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onEdit}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onEdit();
      }}
    >
      <div className="card-top">
        <span className="prio" style={{ color: p.color }}>
          <span className="prio-dot" style={{ background: p.color }} />
          {p.name}
        </span>
        {task.figmaLink && (
          <a
            className="figma"
            href={task.figmaLink}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Open mockup"
          >
            <Link2 size={13} />
          </a>
        )}
      </div>

      <h3 className="card-title">{task.title}</h3>

      <div className="card-foot">
        {due ? (
          <span className={`due due-${due.state}`}>
            <Calendar size={12} />
            {due.label}
          </span>
        ) : (
          <span className="due due-empty">
            <Calendar size={12} />
            No date
          </span>
        )}
        {task.assignee ? (
          <span
            className="avatar"
            style={{ background: avatarColor(task.assignee) }}
            title={task.assignee}
          >
            {initials(task.assignee)}
          </span>
        ) : (
          <span className="avatar unassigned" title="Unassigned">
            —
          </span>
        )}
      </div>
    </article>
  );
}

/* ---------------------------- TaskModal --------------------------- */
function TaskModal({ initial, defaultStage, members, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [desc, setDesc] = useState(initial?.description || "");
  const [assignee, setAssignee] = useState(initial?.assignee || "");
  const [priority, setPriority] = useState(initial?.priority || "medium");
  const [dueDate, setDueDate] = useState(initial?.dueDate || "");
  const [figmaLink, setFigmaLink] = useState(initial?.figmaLink || "");
  const [stage, setStage] = useState(initial?.stage || defaultStage);
  const [err, setErr] = useState("");
  const titleRef = useRef(null);

  useEffect(() => {
    const id = setTimeout(() => titleRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);

  const save = () => {
    if (!title.trim()) {
      setErr("Give the card a title so the team knows what it is.");
      return;
    }
    onSave({
      id: initial?.id || uid(),
      title: title.trim(),
      description: desc.trim(),
      assignee,
      priority,
      dueDate,
      figmaLink: figmaLink.trim(),
      stage,
      createdAt: initial?.createdAt || Date.now(),
    });
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{initial ? "Edit card" : "New card"}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <label className="field">
            <span className="field-lbl">Title</span>
            <input
              ref={titleRef}
              className="in"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (err) setErr("");
              }}
              placeholder="e.g. Redesign pricing page hero"
            />
          </label>
          {err && <p className="err">{err}</p>}

          <label className="field">
            <span className="field-lbl">Description</span>
            <textarea
              className="in area"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              placeholder="Context, acceptance criteria, links…"
            />
          </label>

          <div className="row2">
            <label className="field">
              <span className="field-lbl">Stage</span>
              <div className="selwrap">
                <select className="sel wide" value={stage} onChange={(e) => setStage(e.target.value)}>
                  {STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label className="field">
              <span className="field-lbl">Priority</span>
              <div className="selwrap">
                <select className="sel wide" value={priority} onChange={(e) => setPriority(e.target.value)}>
                  {PRIORITIES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </div>

          <div className="row2">
            <label className="field">
              <span className="field-lbl">Assignee</span>
              <div className="selwrap">
                <select className="sel wide" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label className="field">
              <span className="field-lbl">Due date</span>
              <input
                className="in"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
          </div>

          <label className="field">
            <span className="field-lbl">Mockup / Figma link</span>
            <input
              className="in"
              type="url"
              value={figmaLink}
              onChange={(e) => setFigmaLink(e.target.value)}
              placeholder="https://figma.com/…"
            />
          </label>
        </div>

        <div className="modal-foot">
          {initial ? (
            <button className="btn danger" onClick={() => onDelete(initial.id)}>
              <Trash2 size={15} /> Delete
            </button>
          ) : (
            <span />
          )}
          <div className="foot-right">
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" onClick={save}>
              <Check size={16} strokeWidth={2.4} />
              {initial ? "Save changes" : "Add card"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamModal({ members, tasks, onAdd, onRemove, onClear, onClose }) {
  const [name, setName] = useState("");
  const count = (m) => tasks.filter((t) => t.assignee === m).length;
  const add = () => {
    onAdd(name);
    setName("");
  };
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal narrow" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Team</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="add-member">
            <input
              className="in"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Add a teammate's name"
            />
            <button className="btn primary" onClick={add}>
              <UserPlus size={15} /> Add
            </button>
          </div>

          <ul className="member-list">
            {members.length === 0 && <li className="empty-row">No teammates yet.</li>}
            {members.map((m) => (
              <li key={m} className="member-row">
                <span className="avatar sm" style={{ background: avatarColor(m) }}>
                  {initials(m)}
                </span>
                <span className="member-name">{m}</span>
                <span className="member-count">{count(m)} cards</span>
                <button
                  className="icon-btn small"
                  onClick={() => onRemove(m)}
                  aria-label={`Remove ${m}`}
                  title="Remove teammate"
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="modal-foot">
          <button className="btn danger ghost-danger" onClick={onClear}>
            <Trash2 size={15} /> Clear all cards
          </button>
          <div className="foot-right">
            <button className="btn primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- CSS ------------------------------ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');

:root{
  --bg:#F5F6F9; --surface:#FFFFFF; --surface-2:#FBFBFD;
  --ink:#1B2333; --ink-2:#586074; --muted:#8A93A6;
  --line:#E6E9F0; --line-2:#EEF0F5;
  --accent:#4338CA; --accent-2:#5B50E6; --accent-weak:#EEEDFB;
  --p-urgent:#E5484D; --p-high:#EA8033; --p-medium:#3E77E0; --p-low:#A6AEBD;
  --s-backlog:#94A3B8; --s-design:#8B5CF6; --s-review:#6366F1;
  --s-dev:#3B82F6; --s-qa:#F59E0B; --s-done:#22C55E;
  --font-display:'Space Grotesk','Segoe UI',system-ui,sans-serif;
  --font-body:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  --shadow:0 1px 2px rgba(20,28,48,.05),0 1px 3px rgba(20,28,48,.04);
  --shadow-lg:0 12px 40px rgba(20,28,48,.18);
}
*{box-sizing:border-box;}
.app{
  height:100vh; display:flex; flex-direction:column;
  background:var(--bg); color:var(--ink);
  font-family:var(--font-body); font-size:14px; -webkit-font-smoothing:antialiased;
}
.app *::-webkit-scrollbar{height:10px;width:10px;}
.app *::-webkit-scrollbar-thumb{background:#D3D8E2;border-radius:8px;border:2px solid transparent;background-clip:content-box;}
.app *::-webkit-scrollbar-thumb:hover{background:#BCC3D1;background-clip:content-box;}
.app *::-webkit-scrollbar-track{background:transparent;}

/* ---- top bar ---- */
.topbar{
  display:flex;align-items:center;gap:16px;flex-wrap:wrap;
  padding:12px 20px;background:var(--surface);
  border-bottom:1px solid var(--line);
}
.brand{display:flex;align-items:center;gap:11px;margin-right:auto;}
.mark{
  width:30px;height:30px;border-radius:9px;display:grid;place-items:center;
  background:var(--accent);color:#fff;
  box-shadow:inset 0 -2px 4px rgba(0,0,0,.15);
}
.brand-txt{display:flex;flex-direction:column;line-height:1.05;}
.brand-txt h1{font-family:var(--font-display);font-size:18px;font-weight:600;margin:0;letter-spacing:-.01em;}
.brand-sub{font-size:11.5px;color:var(--muted);font-weight:500;margin-top:1px;}

.tools{display:flex;align-items:center;gap:9px;flex-wrap:wrap;}
.searchbox{position:relative;display:flex;align-items:center;}
.search-ic{position:absolute;left:10px;color:var(--muted);pointer-events:none;}
.searchbox input{
  font-family:inherit;font-size:13px;color:var(--ink);
  border:1px solid var(--line);background:var(--surface-2);
  border-radius:9px;padding:8px 26px 8px 30px;width:190px;transition:border-color .15s,background .15s;
}
.searchbox input:focus{outline:none;border-color:var(--accent);background:#fff;box-shadow:0 0 0 3px var(--accent-weak);}
.search-clear{position:absolute;right:6px;border:none;background:none;color:var(--muted);cursor:pointer;padding:3px;display:grid;place-items:center;border-radius:6px;}
.search-clear:hover{background:var(--line-2);color:var(--ink);}

.selwrap{position:relative;}
.sel{
  font-family:inherit;font-size:13px;color:var(--ink);cursor:pointer;
  border:1px solid var(--line);background:var(--surface-2);
  border-radius:9px;padding:8px 30px 8px 11px;
  appearance:none;-webkit-appearance:none;-moz-appearance:none;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238A93A6' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
  background-repeat:no-repeat;background-position:right 10px center;
}
.sel:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-weak);}
.sel.wide{width:100%;}

.overdue-pill{
  display:inline-flex;align-items:center;gap:5px;
  font-size:12px;font-weight:600;color:var(--p-urgent);
  background:#FDECED;border:1px solid #F7C9CB;border-radius:8px;padding:6px 9px;
}

/* ---- buttons ---- */
.btn{
  font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;
  display:inline-flex;align-items:center;gap:6px;
  border-radius:9px;padding:8px 13px;border:1px solid transparent;transition:all .14s;white-space:nowrap;
}
.btn.primary{background:var(--accent);color:#fff;box-shadow:var(--shadow);}
.btn.primary:hover{background:var(--accent-2);}
.btn.ghost{background:var(--surface);color:var(--ink-2);border-color:var(--line);}
.btn.ghost:hover{border-color:#D3D8E2;color:var(--ink);background:var(--surface-2);}
.btn.danger{background:#FDECED;color:var(--p-urgent);}
.btn.danger:hover{background:#FBDCDE;}
.btn.ghost-danger{background:transparent;border-color:transparent;}
.btn.ghost-danger:hover{background:#FDECED;}
.icon-btn{border:none;background:none;color:var(--muted);cursor:pointer;display:grid;place-items:center;border-radius:8px;padding:6px;transition:all .14s;}
.icon-btn:hover{background:var(--line-2);color:var(--ink);}
.icon-btn.small{padding:5px;}

.notice{
  font-size:12.5px;color:#8A5B00;background:#FFF7E6;border-bottom:1px solid #FCE6B5;
  padding:8px 20px;
}

/* ---- loading ---- */
.loading{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:var(--muted);font-size:13px;}
.spinner{width:26px;height:26px;border:3px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite;}
@keyframes spin{to{transform:rotate(360deg);}}

/* ---- board ---- */
.board{
  flex:1;display:flex;gap:14px;overflow-x:auto;overflow-y:hidden;
  padding:18px 20px 22px;align-items:flex-start;
}
.col{
  flex:0 0 288px;max-width:288px;height:100%;
  display:flex;flex-direction:column;
  background:#EEF0F5;border:1px solid var(--line);border-radius:14px;
  transition:background .15s,box-shadow .15s,border-color .15s;
}
.col.drop{background:var(--accent-weak);border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-weak);}
.col-head{
  display:flex;align-items:center;gap:8px;padding:13px 14px 10px;
}
.dot{width:9px;height:9px;border-radius:50%;flex:none;}
.col-name{font-family:var(--font-display);font-weight:600;font-size:13.5px;letter-spacing:-.01em;}
.col-count{
  margin-left:auto;font-size:12px;font-weight:600;color:var(--ink-2);
  background:var(--surface);border:1px solid var(--line);border-radius:20px;
  min-width:22px;height:20px;padding:0 7px;display:grid;place-items:center;
}
.col-body{
  flex:1;overflow-y:auto;padding:2px 10px 4px;display:flex;flex-direction:column;gap:9px;min-height:36px;
}
.col-add{
  margin:6px 10px 11px;font-family:inherit;font-size:12.5px;font-weight:600;color:var(--ink-2);
  background:transparent;border:1px dashed #C9CFDB;border-radius:9px;
  padding:8px;display:flex;align-items:center;justify-content:center;gap:5px;cursor:pointer;transition:all .14s;
}
.col-add:hover{border-color:var(--accent);color:var(--accent);background:var(--surface);}
.empty{font-size:12px;color:#A6AEBD;text-align:center;padding:14px 4px;font-style:italic;}

/* ---- card ---- */
.card{
  position:relative;background:var(--surface);border:1px solid var(--line);
  border-radius:11px;padding:11px 12px 10px;cursor:pointer;
  box-shadow:var(--shadow);transition:transform .12s,box-shadow .12s,border-color .12s;
  overflow:hidden;
}
.card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--spine);}
.card:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(20,28,48,.10);border-color:#D6DBE6;}
.card:focus-visible{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-weak);}
.card.is-dragging{opacity:.4;transform:rotate(1.5deg);}
.card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
.prio{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;}
.prio-dot{width:6px;height:6px;border-radius:50%;}
.figma{color:var(--accent);display:grid;place-items:center;padding:2px;border-radius:6px;transition:background .14s;}
.figma:hover{background:var(--accent-weak);}
.card-title{font-size:13.5px;font-weight:550;line-height:1.34;margin:0 0 10px;color:var(--ink);letter-spacing:-.005em;}
.card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.due{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:600;padding:3px 7px;border-radius:7px;}
.due-normal{color:var(--ink-2);background:var(--surface-2);border:1px solid var(--line);}
.due-empty{color:#AEB6C4;background:transparent;border:1px solid var(--line-2);}
.due-soon{color:#8A5B00;background:#FFF3DB;}
.due-today{color:#8A5B00;background:#FFEAC2;}
.due-overdue{color:var(--p-urgent);background:#FDECED;}
.avatar{
  width:26px;height:26px;border-radius:50%;color:#fff;font-size:10.5px;font-weight:700;
  display:grid;place-items:center;flex:none;letter-spacing:.02em;box-shadow:inset 0 -1px 2px rgba(0,0,0,.12);
}
.avatar.unassigned{background:#E4E7EF!important;color:#A6AEBD;box-shadow:none;}
.avatar.sm{width:28px;height:28px;font-size:11px;}

/* ---- modal ---- */
.overlay{
  position:fixed;inset:0;background:rgba(22,28,45,.42);backdrop-filter:blur(2px);
  display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;z-index:50;
  animation:fade .16s ease;overflow-y:auto;
}
@keyframes fade{from{opacity:0;}to{opacity:1;}}
.modal{
  width:100%;max-width:520px;background:var(--surface);border-radius:16px;
  box-shadow:var(--shadow-lg);animation:pop .18s cubic-bezier(.2,.8,.3,1);overflow:hidden;
}
.modal.narrow{max-width:420px;}
@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.98);}to{opacity:1;transform:none;}}
.modal-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--line);}
.modal-head h2{font-family:var(--font-display);font-size:16px;font-weight:600;margin:0;letter-spacing:-.01em;}
.modal-body{padding:16px 18px;display:flex;flex-direction:column;gap:13px;}
.field{display:flex;flex-direction:column;gap:6px;}
.field-lbl{font-size:11.5px;font-weight:600;color:var(--ink-2);text-transform:uppercase;letter-spacing:.03em;}
.in{
  font-family:inherit;font-size:13.5px;color:var(--ink);
  border:1px solid var(--line);background:var(--surface-2);border-radius:9px;padding:9px 11px;width:100%;transition:all .14s;
}
.in:focus{outline:none;border-color:var(--accent);background:#fff;box-shadow:0 0 0 3px var(--accent-weak);}
.area{resize:vertical;min-height:64px;line-height:1.45;}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:11px;}
.err{color:var(--p-urgent);font-size:12px;margin:-6px 0 0;font-weight:500;}
.modal-foot{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-top:1px solid var(--line);background:var(--surface-2);}
.foot-right{display:flex;gap:9px;margin-left:auto;}

/* ---- team ---- */
.add-member{display:flex;gap:9px;}
.add-member .in{flex:1;}
.member-list{list-style:none;margin:2px 0 0;padding:0;display:flex;flex-direction:column;gap:2px;max-height:320px;overflow-y:auto;}
.member-row{display:flex;align-items:center;gap:10px;padding:8px 6px;border-radius:9px;transition:background .12s;}
.member-row:hover{background:var(--surface-2);}
.member-name{font-weight:550;font-size:13.5px;}
.member-count{margin-left:auto;font-size:11.5px;color:var(--muted);font-weight:500;}
.empty-row{color:var(--muted);font-size:13px;padding:10px 6px;font-style:italic;}
.btn-lbl{}

@media (max-width:640px){
  .brand-sub{display:none;}
  .searchbox input{width:130px;}
  .btn-lbl{display:none;}
  .row2{grid-template-columns:1fr;}
  .board{padding:14px 12px 18px;}
}
@media (prefers-reduced-motion:reduce){
  *{animation:none!important;transition:none!important;}
}
`;
