import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";

export const adminSessionController = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "Admin access granted.",
    data: {
      role: req.authUser?.role,
    },
  });
});
