export interface Project {
  name: string;
  path: string;
}

export interface Turn {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string;
}

export interface SessionSummary {
  id: string;
  projectName: string;
  title: string;
  updatedAt: string;
  turnCount: number;
}

export interface SessionDetail extends SessionSummary {
  cwd: string;
  turns: Turn[];
  createdAt: string;
}

const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8787";
const TOKEN_STORAGE_KEY = "copilot-g2-token";

export function getToken(): string {
  return localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

const AUTH_SCHEME = "Bearer";

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", [AUTH_SCHEME, getToken()].join(" "));
  if (init.body) headers.set("Content-Type", "application/json");

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res;
}

export async function fetchProjects(): Promise<{ projects: Project[]; defaultProjectName?: string }> {
  const res = await authFetch("/projects");
  return res.json();
}

export async function fetchSessions(): Promise<SessionSummary[]> {
  const res = await authFetch("/sessions");
  const data = await res.json();
  return data.sessions;
}

export async function fetchSession(id: string): Promise<SessionDetail> {
  const res = await authFetch(`/sessions/${id}`);
  const data = await res.json();
  return data.session;
}

export async function createSession(projectName: string, title?: string): Promise<SessionDetail> {
  const res = await authFetch("/sessions", {
    method: "POST",
    body: JSON.stringify({ projectName, title }),
  });
  const data = await res.json();
  return data.session;
}

export async function deleteSession(id: string): Promise<void> {
  await authFetch(`/sessions/${id}`, { method: "DELETE" });
}

export async function sendMessage(sessionId: string, message: string): Promise<Turn> {
  const res = await authFetch(`/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
  const data = await res.json();
  return data.turn;
}

export type SessionEventType =
  | "turn.user"
  | "turn.start"
  | "turn.chunk"
  | "turn.complete";

export interface SessionEvent {
  type: SessionEventType;
  sessionId: string;
  [key: string]: unknown;
}

/**
 * Opens an SSE connection to `/events`. `EventSource` can't send custom
 * headers, so the bearer token is passed as a query param instead — the
 * backend's auth middleware accepts either.
 */
export function subscribeToEvents(onEvent: (event: SessionEvent) => void): () => void {
  const url = `${BASE_URL}/events?token=${encodeURIComponent(getToken())}`;
  const source = new EventSource(url);
  source.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data));
    } catch {
      // ignore malformed/keep-alive events
    }
  };
  return () => source.close();
}
