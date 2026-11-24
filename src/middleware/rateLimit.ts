import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function requestIdentity(req: Request): string {
  const ip = req.ip ?? "unknown";
  const body = req.body;

  if (!body || typeof body !== "object") {
    return ip;
  }

  const record = body as Record<string, unknown>;
  const identifier = typeof record.identifier === "string" ? record.identifier : record.email;
  if (typeof identifier !== "string") {
    return ip;
  }

  return `${ip}:${identifier.trim().toLowerCase()}`;
}

export function rateLimit(name: string, max: number, windowMs: number) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${name}:${requestIdentity(req)}`;
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (current.count >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      next(
        new AppError(429, "Too many requests. Please wait and try again.", {
          retryAfterSeconds,
        }),
      );
      return;
    }

    current.count += 1;
    next();
  };
}
