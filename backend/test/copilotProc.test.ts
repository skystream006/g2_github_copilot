import { describe, expect, it } from "vitest";
import { buildArgs } from "../src/sessions/copilotProc.js";

describe("buildArgs", () => {
  it("builds the minimal headless invocation", () => {
    const args = buildArgs({ prompt: "list files", cwd: "/tmp" });
    expect(args).toEqual(["-p", "list files", "-s", "--no-ask-user"]);
  });

  it("adds --resume when a Copilot session id is known", () => {
    const args = buildArgs({
      prompt: "continue",
      cwd: "/tmp",
      resumeSessionId: "abc-123",
    });
    expect(args).toContain("--resume");
    expect(args).toContain("abc-123");
  });

  it("adds --model when provided", () => {
    const args = buildArgs({ prompt: "hi", cwd: "/tmp", model: "gpt-5.2" });
    expect(args).toContain("--model");
    expect(args).toContain("gpt-5.2");
  });

  it("adds --allow-all when requested", () => {
    const args = buildArgs({ prompt: "hi", cwd: "/tmp", allowAll: true });
    expect(args).toContain("--allow-all");
  });

  it("omits optional flags by default", () => {
    const args = buildArgs({ prompt: "hi", cwd: "/tmp" });
    expect(args).not.toContain("--resume");
    expect(args).not.toContain("--model");
    expect(args).not.toContain("--allow-all");
  });
});
