import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventHub } from "../src/events.js";
import { SessionManager } from "../src/sessions/manager.js";
import { SessionStore } from "../src/sessions/store.js";
import type { RunTurnFn } from "../src/sessions/manager.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "copilot-g2-manager-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeManager(runTurn: RunTurnFn) {
  const store = new SessionStore(join(dir, "sessions.json"));
  const events = new EventHub();
  const manager = new SessionManager({
    store,
    events,
    projects: [{ name: "demo", path: "/tmp/demo" }],
    runTurn,
  });
  return { manager, store, events };
}

describe("SessionManager", () => {
  it("throws when creating a session for an unknown project", () => {
    const { manager } = makeManager(vi.fn());
    expect(() => manager.createSession("nope")).toThrow(/Unknown project/);
  });

  it("creates a session bound to the project's cwd", () => {
    const { manager } = makeManager(vi.fn());
    const session = manager.createSession("demo", "My session");
    expect(session.cwd).toBe("/tmp/demo");
    expect(session.title).toBe("My session");
    expect(session.turns).toEqual([]);
  });

  it("runs a turn, streaming chunks and recording the assistant reply", async () => {
    const runTurn = vi.fn(async (options) => {
      options.onChunk?.("Hello ");
      options.onChunk?.("world");
      return { text: "Hello world", exitCode: 0 };
    });
    const { manager, events } = makeManager(runTurn);
    const session = manager.createSession("demo");

    const publishSpy = vi.spyOn(events, "publish");

    const assistantTurn = await manager.sendMessage(session.id, "hi there");

    expect(assistantTurn.role).toBe("assistant");
    expect(assistantTurn.text).toBe("Hello world");
    expect(runTurn).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "hi there", cwd: "/tmp/demo" }),
    );

    const eventTypes = publishSpy.mock.calls.map(([event]) => event.type);
    expect(eventTypes).toEqual([
      "turn.user",
      "turn.start",
      "turn.chunk",
      "turn.chunk",
      "turn.complete",
    ]);

    const updated = manager.getSession(session.id)!;
    expect(updated.turns).toHaveLength(2);
    expect(updated.turns[0]).toMatchObject({ role: "user", text: "hi there" });
    expect(updated.turns[1]).toMatchObject({ role: "assistant", text: "Hello world" });
  });

  it("stores the Copilot session id and uses --resume on the next turn", async () => {
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce({ text: "first reply", copilotSessionId: "cs-1", exitCode: 0 })
      .mockResolvedValueOnce({ text: "second reply", exitCode: 0 });
    const { manager } = makeManager(runTurn);
    const session = manager.createSession("demo");

    await manager.sendMessage(session.id, "first message");
    await manager.sendMessage(session.id, "second message");

    expect(runTurn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ prompt: "first message", resumeSessionId: undefined }),
    );
    expect(runTurn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ prompt: "second message", resumeSessionId: "cs-1" }),
    );
  });

  it("falls back to replaying transcript history when no Copilot session id is known", async () => {
    const runTurn = vi.fn().mockResolvedValue({ text: "reply", exitCode: 0 });
    const { manager } = makeManager(runTurn);
    const session = manager.createSession("demo");

    await manager.sendMessage(session.id, "first message");
    await manager.sendMessage(session.id, "second message");

    const secondCallPrompt = runTurn.mock.calls[1][0].prompt as string;
    expect(secondCallPrompt).toContain("User: first message");
    expect(secondCallPrompt).toContain("Assistant: reply");
    expect(secondCallPrompt).toContain("User: second message");
  });

  it("deletes a session", () => {
    const { manager } = makeManager(vi.fn());
    const session = manager.createSession("demo");
    expect(manager.deleteSession(session.id)).toBe(true);
    expect(manager.getSession(session.id)).toBeUndefined();
  });
});
