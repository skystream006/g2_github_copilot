import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Project {
  name: string;
  path: string;
}

export interface AppConfig {
  token: string;
  projects: Project[];
  defaultProjectName?: string;
  model?: string;
  allowAll?: boolean;
}

const DEFAULT_CONFIG: Omit<AppConfig, "token"> = {
  projects: [],
  allowAll: false,
};

export function configDir(): string {
  return process.env.COPILOT_G2_HOME ?? join(homedir(), ".copilot-g2");
}

function configPath(): string {
  return join(configDir(), "config.json");
}

function generateToken(): string {
  return randomBytes(24).toString("hex");
}

/**
 * Loads the app config from disk, creating it (with a fresh bearer token)
 * on first run. Mirrors the auto-generated `~/.cc-g2/config.json` from the
 * Claude-based original, but rooted at `~/.copilot-g2` by default.
 */
export function loadOrCreateConfig(): AppConfig {
  const dir = configDir();
  const file = configPath();

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  if (existsSync(file)) {
    const raw = readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw) as AppConfig;
    return { ...DEFAULT_CONFIG, ...parsed };
  }

  const config: AppConfig = { ...DEFAULT_CONFIG, token: generateToken() };
  writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  return config;
}

export function saveConfig(config: AppConfig): void {
  writeFileSync(configPath(), JSON.stringify(config, null, 2), { mode: 0o600 });
}
