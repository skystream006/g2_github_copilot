import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Constant-time string comparison to avoid leaking token length/content via
 * timing side-channels.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still perform a comparison of equal-length buffers so that the
    // early-return path doesn't reveal length differences via timing.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

const AUTH_PREFIX = "bearer ";

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  if (!header.toLowerCase().startsWith(AUTH_PREFIX)) return null;
  const token = header.slice(AUTH_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Express middleware enforcing bearer-token auth using the token generated
 * in the app config. SSE requests may also pass the token via `?token=`
 * since `EventSource` cannot set custom headers.
 */
export function requireAuth(token: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = extractBearerToken(req.header("authorization"));
    const query = typeof req.query.token === "string" ? req.query.token : null;
    const provided = header ?? query;

    if (!provided || !safeCompare(provided, token)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    next();
  };
}
