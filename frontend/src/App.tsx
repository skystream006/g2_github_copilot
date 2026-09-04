import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  createSession,
  deleteSession,
  fetchProjects,
  fetchSession,
  fetchSessions,
  getToken,
  sendMessage,
  setToken,
  subscribeToEvents,
  type Project,
  type SessionDetail,
  type SessionSummary,
  type Turn,
} from "./api";

function useDraftTurn() {
  const [draft, setDraft] = useState<{ text: string; sessionId: string } | null>(null);
  return { draft, setDraft };
}

export default function App() {
  const [tokenInput, setTokenInput] = useState(getToken());
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<SessionDetail | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { draft, setDraft } = useDraftTurn();
  const turnsEndRef = useRef<HTMLDivElement>(null);

  const hasToken = tokenInput.trim().length > 0;

  const refreshSessions = useMemo(
    () => async () => {
      try {
        setSessions(await fetchSessions());
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [],
  );

  useEffect(() => {
    if (!hasToken) return;
    fetchProjects()
      .then((data) => setProjects(data.projects))
      .catch((err) => setError((err as Error).message));
    refreshSessions();
  }, [hasToken, refreshSessions]);

  useEffect(() => {
    if (!hasToken) return;
    const unsubscribe = subscribeToEvents((event) => {
      if (event.type === "turn.chunk" && event.sessionId) {
        setDraft((prev) => {
          const chunk = String(event.chunk ?? "");
          if (prev && prev.sessionId === event.sessionId) {
            return { sessionId: event.sessionId as string, text: prev.text + chunk };
          }
          return { sessionId: event.sessionId as string, text: chunk };
        });
      }
      if (event.type === "turn.complete" && event.sessionId) {
        setDraft(null);
        setActiveSession((prev) =>
          prev && prev.id === event.sessionId ? { ...prev, turns: [...prev.turns, event.turn as Turn] } : prev,
        );
        refreshSessions();
      }
    });
    return unsubscribe;
  }, [hasToken, refreshSessions, setDraft]);

  useEffect(() => {
    turnsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.turns.length, draft?.text]);

  function saveToken() {
    setToken(tokenInput.trim());
    refreshSessions();
  }

  async function handleNewSession() {
    if (projects.length === 0) {
      setError("No projects configured on the backend yet.");
      return;
    }
    try {
      const session = await createSession(projects[0].name);
      setSessions(await fetchSessions());
      setActiveSession(session);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSelectSession(id: string) {
    try {
      setActiveSession(await fetchSession(id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDeleteSession(id: string) {
    try {
      await deleteSession(id);
      if (activeSession?.id === id) setActiveSession(null);
      setSessions(await fetchSessions());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSend() {
    if (!activeSession || !message.trim()) return;
    const text = message;
    setMessage("");
    setSending(true);
    setError(null);
    setActiveSession((prev) =>
      prev
        ? {
            ...prev,
            turns: [
              ...prev.turns,
              { id: `pending-${Date.now()}`, role: "user", text, createdAt: new Date().toISOString() },
            ],
          }
        : prev,
    );
    try {
      await sendMessage(activeSession.id, text);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <h1>Copilot Code G2</h1>
        <input
          placeholder="Auth token from ~/.copilot-g2/config.json"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
        />
        <button onClick={saveToken}>Connect</button>
      </div>

      {error && <div style={{ color: "#f85149", padding: "0.5rem 1rem" }}>{error}</div>}

      <div className="layout">
        <aside className="sidebar">
          <button className="new-session" onClick={handleNewSession}>
            + New session
          </button>
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`session-item ${activeSession?.id === s.id ? "active" : ""}`}
              onClick={() => handleSelectSession(s.id)}
            >
              <div className="title">{s.title}</div>
              <div className="meta">
                {s.projectName} · {s.turnCount} turns
              </div>
              <button onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}>
                Delete
              </button>
            </div>
          ))}
        </aside>

        <section className="transcript">
          {!activeSession && <div className="empty-state">Select or create a session to start.</div>}
          {activeSession && (
            <>
              <div className="turns">
                {activeSession.turns.map((turn) => (
                  <div key={turn.id} className={`turn ${turn.role}`}>
                    <div className="role">{turn.role}</div>
                    <div>{turn.text}</div>
                  </div>
                ))}
                {draft && draft.sessionId === activeSession.id && (
                  <div className="turn assistant">
                    <div className="role">assistant (typing…)</div>
                    <div>{draft.text}</div>
                  </div>
                )}
                <div ref={turnsEndRef} />
              </div>
              <div className="composer">
                <textarea
                  rows={2}
                  placeholder="Ask Copilot to do something…"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <button onClick={handleSend} disabled={sending || !message.trim()}>
                  Send
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
