import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadOrCreateConfig, saveConfig } from "../src/config.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "copilot-g2-config-"));
  process.env.COPILOT_G2_HOME = dir;
});

afterEach(() => {
  delete process.env.COPILOT_G2_HOME;
  rmSync(dir, { recursive: true, force: true });
});

describe("loadOrCreateConfig", () => {
  it("creates a config with a generated token on first run", () => {
    const config = loadOrCreateConfig();
    expect(config.token).toHaveLength(48);
    expect(config.projects).toEqual([]);
  });

  it("reuses the same token on subsequent loads", () => {
    const first = loadOrCreateConfig();
    const second = loadOrCreateConfig();
    expect(second.token).toBe(first.token);
  });

  it("persists edits made with saveConfig", () => {
    const config = loadOrCreateConfig();
    config.projects.push({ name: "demo", path: "/tmp/demo" });
    saveConfig(config);

    const reloaded = loadOrCreateConfig();
    expect(reloaded.projects).toEqual([{ name: "demo", path: "/tmp/demo" }]);
  });
});
