import express from "express";
import { join } from "node:path";
import { requireAuth } from "./auth.js";
import { configDir, loadOrCreateConfig } from "./config.js";
import { EventHub } from "./events.js";
import { SessionManager } from "./sessions/manager.js";
import { SessionStore } from "./sessions/store.js";
import { toSummary } from "./sessions/types.js";

export function createApp() {
  const config = loadOrCreateConfig();
  const store = new SessionStore(join(configDir(), "sessions.json"));
  const events = new EventHub();
  const manager = new SessionManager({
    store,
    events,
    projects: config.projects,
    model: config.model,
    allowAll: config.allowAll,
  });

  const app = express();
  app.use(express.json());

  // Health check is intentionally unauthenticated so load balancers / dev
  // tooling can probe it without a token.
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const auth = requireAuth(config.token);

  app.get("/projects", auth, (_req, res) => {
    res.json({ projects: config.projects, defaultProjectName: config.defaultProjectName });
  });

  app.get("/sessions", auth, (_req, res) => {
    res.json({ sessions: manager.listSessions().map(toSummary) });
  });

  app.post("/sessions", auth, (req, res) => {
    const { projectName, title } = req.body ?? {};
    if (typeof projectName !== "string") {
      res.status(400).json({ error: "projectName is required" });
      return;
    }
    try {
      const session = manager.createSession(projectName, title);
      res.status(201).json({ session });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get("/sessions/:id", auth, (req, res) => {
    const session = manager.getSession(String(req.params.id));
    if (!session) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json({ session });
  });

  app.delete("/sessions/:id", auth, (req, res) => {
    const deleted = manager.deleteSession(String(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.status(204).end();
  });

  app.post("/sessions/:id/messages", auth, async (req, res) => {
    const { message } = req.body ?? {};
    if (typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({ error: "message is required" });
      return;
    }
    try {
      const turn = await manager.sendMessage(String(req.params.id), message);
      res.json({ turn });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get("/events", auth, (req, res) => {
    events.subscribe(res);
  });

  return { app, config, manager, events, store };
}

function main() {
  const { app, config } = createApp();
  const port = Number(process.env.PORT ?? 8787);
  app.listen(port, () => {
    console.log(`copilot-code-g2 backend listening on :${port}`);
    console.log(`Auth token stored at ${join(configDir(), "config.json")}`);
    if (config.projects.length === 0) {
      console.log(
        "No projects configured yet — add one to ~/.copilot-g2/config.json under \"projects\".",
      );
    }
  });
}

// Only start the server when run directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
