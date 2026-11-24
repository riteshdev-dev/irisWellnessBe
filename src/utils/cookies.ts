import type { CookieOptions, Request, Response } from "express";
import { env } from "../config/env.js";

export const ACCESS_TOKEN_COOKIE = "access_token";

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env().isProduction,
    sameSite: "lax",
    path: "/",
  };
}

function expiresInToMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) {
    return 12 * 60 * 60 * 1000;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * (multipliers[unit ?? "h"] ?? 60 * 60 * 1000);
}

export function setAccessTokenCookie(res: Response, token: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE, token, {
    ...cookieOptions(),
    maxAge: expiresInToMs(env().jwtExpiresIn),
  });
}

export function clearAccessTokenCookie(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, cookieOptions());
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) {
    return undefined;
  }

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = decodeURIComponent(part.slice(0, separator).trim());
    if (key === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }

  return undefined;
}

export function getAccessToken(req: Request): string | undefined {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    if (token) {
      return token;
    }
  }

  return readCookie(req, ACCESS_TOKEN_COOKIE);
}
