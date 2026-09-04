import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SessionRecord } from "./types.js";

/**
 * Disk-backed store for sessions, mirroring `~/.cc-g2/sessions.json` from
 * the Claude-based original. Kept intentionally simple: the whole session
 * list is read/written as one JSON file, which is fine at the scale of a
 * personal coding-assistant tool.
 */
export class SessionStore {
  private sessions = new Map<string, SessionRecord>();

  constructor(private readonly filePath: string) {
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    const raw = readFileSync(this.filePath, "utf-8");
    if (!raw.trim()) return;
    const records = JSON.parse(raw) as SessionRecord[];
    for (const record of records) {
      this.sessions.set(record.id, record);
    }
  }

  private persist(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const records = [...this.sessions.values()].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    writeFileSync(this.filePath, JSON.stringify(records, null, 2));
  }

  list(): SessionRecord[] {
    return [...this.sessions.values()].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  get(id: string): SessionRecord | undefined {
    return this.sessions.get(id);
  }

  upsert(session: SessionRecord): void {
    this.sessions.set(session.id, session);
    this.persist();
  }

  delete(id: string): boolean {
    const existed = this.sessions.delete(id);
    if (existed) this.persist();
    return existed;
  }
}
