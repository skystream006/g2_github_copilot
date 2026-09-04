import { spawn } from "node:child_process";

export interface RunTurnOptions {
  /** The user's message for this turn. */
  prompt: string;
  /** Working directory the CLI should operate in (whitelisted project path). */
  cwd: string;
  /** Resume a previous Copilot CLI session instead of starting a new one. */
  resumeSessionId?: string;
  /** Model override, e.g. `gpt-5.2` or `claude-sonnet-4.6`. */
  model?: string;
  /** Grant every tool/path/url permission for hands-free use. Use with care. */
  allowAll?: boolean;
  /** Override the CLI binary name/path. Defaults to `copilot`. */
  command?: string;
  onChunk?: (chunk: string) => void;
}

export interface TurnResult {
  text: string;
  copilotSessionId?: string;
  exitCode: number | null;
}

// Matches the CLI's own session id when it's echoed in stdout, e.g.
// "Session ID: 3fbd6e2a-...". Best effort: if the running CLI version
// doesn't print this, `copilotSessionId` simply stays undefined and the
// SessionManager falls back to replaying transcript history instead of
// `--resume`.
const SESSION_ID_PATTERN = /session[\s_-]?id[:\s]+([a-f0-9-]{8,})/i;

/**
 * Builds the argv for a single headless Copilot CLI turn. Exported
 * separately from `runTurn` so it can be unit tested without spawning a
 * real process.
 */
export function buildArgs(options: RunTurnOptions): string[] {
  const args = ["-p", options.prompt, "-s", "--no-ask-user"];

  if (options.resumeSessionId) {
    args.push("--resume", options.resumeSessionId);
  }
  if (options.model) {
    args.push("--model", options.model);
  }
  if (options.allowAll) {
    args.push("--allow-all");
  }

  return args;
}

/**
 * Spawns the `copilot` CLI in non-interactive mode (`-p`) for one
 * request/response turn, streaming stdout chunks as they arrive and
 * resolving with the full text once the process exits. This mirrors how
 * the Claude-based original spawned `claude -p` per turn, adapted to
 * Copilot CLI's single-shot headless mode instead of a persistent
 * stream-json stdin/stdout protocol.
 */
export function runTurn(options: RunTurnOptions): Promise<TurnResult> {
  return new Promise((resolve, reject) => {
    const command = options.command ?? "copilot";
    const args = buildArgs(options);
    const child = spawn(command, args, { cwd: options.cwd });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString("utf-8");
      stdout += chunk;
      options.onChunk?.(chunk);
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString("utf-8");
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (exitCode) => {
      if (exitCode !== 0 && stdout.length === 0) {
        reject(new Error(stderr.trim() || `copilot exited with code ${exitCode}`));
        return;
      }
      const match = SESSION_ID_PATTERN.exec(stdout);
      resolve({
        text: stdout.trim(),
        copilotSessionId: match?.[1],
        exitCode,
      });
    });
  });
}
