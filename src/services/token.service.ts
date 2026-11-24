import { randomUUID } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";
import type { UserRole } from "../types/auth.js";
import { AppError } from "../utils/AppError.js";

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  jti: string;
  exp: number;
}

export interface ChallengeTokenPayload {
  sub: string;
  purpose: "login" | "reset_password";
  jti: string;
  exp: number;
}

export function signAccessToken(userId: string, role: UserRole): string {
  const config = env();
  const options: SignOptions = {
    subject: userId,
    jwtid: randomUUID(),
    expiresIn: config.jwtExpiresIn as SignOptions["expiresIn"],
  };

  return jwt.sign({ role }, config.jwtSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env().jwtSecret);
    if (typeof decoded === "string" || typeof decoded.sub !== "string") {
      throw new AppError(401, "Invalid session.");
    }

    const role = (decoded as Record<string, unknown>).role;
    const jti = (decoded as Record<string, unknown>).jti;
    const exp = (decoded as Record<string, unknown>).exp;

    if (
      (role !== "ADMIN" && role !== "USER") ||
      typeof jti !== "string" ||
      typeof exp !== "number"
    ) {
      throw new AppError(401, "Invalid session.");
    }

    return { sub: decoded.sub, role, jti, exp };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(401, "Your session has expired. Please log in again.");
    }

    throw new AppError(401, "Invalid session.");
  }
}

export function signChallengeToken(userId: string, purpose: "login" | "reset_password"): string {
  const config = env();
  const options: SignOptions = {
    subject: userId,
    jwtid: randomUUID(),
    expiresIn: "5m", // 5 minutes validity
  };

  return jwt.sign({ purpose }, config.jwtSecret, options);
}

export function verifyChallengeToken(token: string, expectedPurpose: "login" | "reset_password"): ChallengeTokenPayload {
  try {
    const decoded = jwt.verify(token, env().jwtSecret);
    if (typeof decoded === "string" || typeof decoded.sub !== "string") {
      throw new AppError(400, "Invalid verification session.");
    }

    const purpose = (decoded as Record<string, unknown>).purpose;
    const jti = (decoded as Record<string, unknown>).jti;
    const exp = (decoded as Record<string, unknown>).exp;

    if (purpose !== expectedPurpose || typeof jti !== "string" || typeof exp !== "number") {
      throw new AppError(400, "Invalid verification session.");
    }

    return { sub: decoded.sub, purpose: expectedPurpose, jti, exp };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(400, "Verification session has expired. Please request a new code.");
    }

    throw new AppError(400, "Invalid verification session.");
  }
}
