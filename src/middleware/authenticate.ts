import type { NextFunction, Request, Response } from "express";
import { isTokenRevoked } from "../models/revokedToken.model.js";
import { findUserById } from "../models/user.model.js";
import { verifyAccessToken } from "../services/token.service.js";
import { AppError } from "../utils/AppError.js";
import { getAccessToken } from "../utils/cookies.js";
import { toPublicUser } from "../utils/userMapper.js";

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = getAccessToken(req);
    if (!token) {
      throw new AppError(401, "Authentication required.");
    }

    const payload = verifyAccessToken(token);
    if (await isTokenRevoked(payload.jti)) {
      throw new AppError(401, "Your session has ended. Please log in again.");
    }

    const user = await findUserById(payload.sub);
    if (!user || !user.is_verified || !user.is_active) {
      throw new AppError(401, "Authentication required.");
    }

    req.authUser = toPublicUser(user);
    next();
  } catch (error) {
    next(error);
  }
}
