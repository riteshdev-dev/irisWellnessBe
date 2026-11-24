import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "../types/auth.js";
import { AppError } from "../utils/AppError.js";

export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      next(new AppError(401, "Authentication required."));
      return;
    }
     console.log('req.authUser.role===', req.authUser.role)
    if (!roles.includes(req.authUser.role)) {
      next(new AppError(403, "You do not have permission to access this resource."));
      return;
    }

    next();
  };
}
