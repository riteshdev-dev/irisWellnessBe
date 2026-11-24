import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({
      success: false,
      message: "Request body must be valid JSON.",
    });
    return;
  }

  console.error("Unhandled error:", error);
  res.status(500).json({
    success: false,
    message: "Something went wrong. Please try again.",
  });
}
