import { randomUUID } from "node:crypto";
import type { EventHub } from "../events.js";
import type { Project } from "../config.js";
import { runTurn, type RunTurnOptions, type TurnResult } from "./copilotProc.js";
import type { SessionStore } from "./store.js";
import type { SessionRecord, Turn } from "./types.js";

export type RunTurnFn = (options: RunTurnOptions) => Promise<TurnResult>;

export interface SessionManagerOptions {
  store: SessionStore;
  events: EventHub;
  projects: Project[];
  model?: string;
  allowAll?: boolean;
  command?: string;
  /** Injectable for tests; defaults to the real `copilot` CLI wrapper. */
  runTurn?: RunTurnFn;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildContextualPrompt(priorTurns: Turn[], copilotSessionId: string | undefined, message: string): string {
  if (priorTurns.length === 0 || copilotSessionId) {
    // Either a fresh session, or we can rely on `--resume` for continuity.
    return message;
  }
  const history = priorTurns
    .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.text}`)
    .join("\n");
  return `${history}\nUser: ${message}`;
}

/**
 * Orchestrates Copilot CLI sessions: creating them, running turns, and
 * publishing streamed events for the frontend. Analogous to `manager.ts`
 * in the Claude-based original, but adapted to Copilot CLI's headless
 * request/response turns instead of a persistent stdin/stdout protocol.
 */
export class SessionManager {
  private readonly store: SessionStore;
  private readonly events: EventHub;
  private readonly projects: Project[];
  private readonly model?: string;
  private readonly allowAll: boolean;
  private readonly command?: string;
  private readonly runTurnFn: RunTurnFn;

  constructor(options: SessionManagerOptions) {
    this.store = options.store;
    this.events = options.events;
    this.projects = options.projects;
    this.model = options.model;
    this.allowAll = options.allowAll ?? false;
    this.command = options.command;
    this.runTurnFn = options.runTurn ?? runTurn;
  }

  listSessions(): SessionRecord[] {
    return this.store.list();
  }

  getSession(id: string): SessionRecord | undefined {
    return this.store.get(id);
  }

  createSession(projectName: string, title?: string): SessionRecord {
    const project = this.projects.find((p) => p.name === projectName);
    if (!project) {
      throw new Error(`Unknown project: ${projectName}`);
    }
    const timestamp = nowIso();
    const session: SessionRecord = {
      id: randomUUID(),
      projectName,
      cwd: project.path,
      title: title ?? "New session",
      turns: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.upsert(session);
    return session;
  }

  deleteSession(id: string): boolean {
    return this.store.delete(id);
  }

  async sendMessage(sessionId: string, message: string): Promise<Turn> {
    const session = this.store.get(sessionId);
    if (!session) {
      throw new Error(`Unknown session: ${sessionId}`);
    }

    const priorTurns = [...session.turns];

    const userTurn: Turn = {
      id: randomUUID(),
      role: "user",
      text: message,
      createdAt: nowIso(),
    };
    session.turns.push(userTurn);
    session.updatedAt = nowIso();
    this.store.upsert(session);
    this.events.publish({ type: "turn.user", sessionId, turn: userTurn });
    this.events.publish({ type: "turn.start", sessionId });

    const prompt = buildContextualPrompt(priorTurns, session.copilotSessionId, message);

    const result = await this.runTurnFn({
      prompt,
      cwd: session.cwd,
      resumeSessionId: session.copilotSessionId,
      model: this.model,
      allowAll: this.allowAll,
      command: this.command,
      onChunk: (chunk) => {
        this.events.publish({ type: "turn.chunk", sessionId, chunk });
      },
    });

    const assistantTurn: Turn = {
      id: randomUUID(),
      role: "assistant",
      text: result.text,
      createdAt: nowIso(),
    };
    session.turns.push(assistantTurn);
    session.updatedAt = nowIso();
    if (result.copilotSessionId) {
      session.copilotSessionId = result.copilotSessionId;
    }
    this.store.upsert(session);
    this.events.publish({ type: "turn.complete", sessionId, turn: assistantTurn });

    return assistantTurn;
  }
}
