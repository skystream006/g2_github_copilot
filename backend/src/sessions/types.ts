export type TurnRole = "user" | "assistant" | "system";

export interface Turn {
  id: string;
  role: TurnRole;
  text: string;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  projectName: string;
  cwd: string;
  title: string;
  turns: Turn[];
  createdAt: string;
  updatedAt: string;
  /** Copilot CLI's own session id, used with `--resume` for follow-ups. */
  copilotSessionId?: string;
}

export interface SessionSummary {
  id: string;
  projectName: string;
  title: string;
  updatedAt: string;
  turnCount: number;
}

export function toSummary(session: SessionRecord): SessionSummary {
  return {
    id: session.id,
    projectName: session.projectName,
    title: session.title,
    updatedAt: session.updatedAt,
    turnCount: session.turns.length,
  };
}
