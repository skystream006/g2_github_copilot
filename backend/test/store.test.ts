import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionStore } from "../src/sessions/store.js";
import type { SessionRecord } from "../src/sessions/types.js";

let dir: string;
let filePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "copilot-g2-store-"));
  filePath = join(dir, "sessions.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "session-1",
    projectName: "demo",
    cwd: "/tmp/demo",
    title: "Untitled",
    turns: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("SessionStore", () => {
  it("returns an empty list when no file exists yet", () => {
    const store = new SessionStore(filePath);
    expect(store.list()).toEqual([]);
  });

  it("upserts and retrieves a session", () => {
    const store = new SessionStore(filePath);
    const session = makeSession();
    store.upsert(session);
    expect(store.get("session-1")).toEqual(session);
  });

  it("persists sessions to disk across instances", () => {
    const store = new SessionStore(filePath);
    store.upsert(makeSession());

    const reloaded = new SessionStore(filePath);
    expect(reloaded.get("session-1")).toMatchObject({ id: "session-1" });
  });

  it("lists sessions most-recently-updated first", () => {
    const store = new SessionStore(filePath);
    store.upsert(makeSession({ id: "a", updatedAt: "2024-01-01T00:00:00.000Z" }));
    store.upsert(makeSession({ id: "b", updatedAt: "2024-02-01T00:00:00.000Z" }));

    expect(store.list().map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("deletes a session", () => {
    const store = new SessionStore(filePath);
    store.upsert(makeSession());
    expect(store.delete("session-1")).toBe(true);
    expect(store.get("session-1")).toBeUndefined();
    expect(store.delete("session-1")).toBe(false);
  });
});
