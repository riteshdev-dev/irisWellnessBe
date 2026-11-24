import type { Request, Response } from "express";
import { revokeToken } from "../models/revokedToken.model.js";
import {
  loginWithPassword,
  REGISTRATION_SUCCESS_MESSAGE,
  requestPasswordReset,
  resendLoginOtp,
  resetPassword,
  signup,
  updateProfile,
  verifyLoginOtp,
} from "../services/auth.service.js";
import { verifyAccessToken } from "../services/token.service.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { clearAccessTokenCookie, getAccessToken, setAccessTokenCookie } from "../utils/cookies.js";
import {
  normalizeEmail,
  parseLoginInput,
  parseOtpCode,
  parseProfileInput,
  parseResetPasswordInput,
  parseSignupInput,
} from "../utils/validators.js";

export const signupController = asyncHandler(async (req: Request, res: Response) => {
  const input = parseSignupInput(req.body);
  const result = await signup(input);

  res.status(201).json({
    success: true,
    message: result.message,
  });
});

export const loginController = asyncHandler(async (req: Request, res: Response) => {
  const input = parseLoginInput(req.body);
  const challenge = await loginWithPassword(input.email, input.password);

  res.status(200).json({
    success: true,
    message: "Verification code sent to your email.",
    data: challenge,
  });
});

export const verifyOtpController = asyncHandler(async (req: Request, res: Response) => {
  const challengeToken = typeof req.body.challengeToken === "string" ? req.body.challengeToken.trim() : "";
  const otp = parseOtpCode(req.body);

  if (!challengeToken) {
    throw new AppError(400, "Verification session token is missing.");
  }

  const result = await verifyLoginOtp(challengeToken, otp);
  setAccessTokenCookie(res, result.token);

  res.status(200).json({
    success: true,
    message: "Verification successful.",
    data: { user: result.user },
  });
});

export const sendOtpController = asyncHandler(async (req: Request, res: Response) => {
  const challengeToken = typeof req.body.challengeToken === "string" ? req.body.challengeToken.trim() : "";

  if (!challengeToken) {
    throw new AppError(400, "Verification session token is missing.");
  }

  const challenge = await resendLoginOtp(challengeToken);

  res.status(200).json({
    success: true,
    message: "A new verification code was sent to your email.",
    data: challenge,
  });
});

export const forgotPasswordController = asyncHandler(async (req: Request, res: Response) => {
  const rawEmail = typeof req.body.email === "string" ? req.body.email : "";
  const email = normalizeEmail(rawEmail);

  if (!email) {
    throw new AppError(400, "Please enter a valid email address.", {
      fields: { email: "Enter a valid email address." },
    });
  }

  const challenge = await requestPasswordReset(email);

  res.status(200).json({
    success: true,
    message: "If an account exists with this email, a verification code has been sent.",
    data: challenge,
  });
});

export const resetPasswordController = asyncHandler(async (req: Request, res: Response) => {
  const input = parseResetPasswordInput(req.body);
  const result = await resetPassword(input);

  res.status(200).json({
    success: true,
    message: result.message,
  });
});

export const meController = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "Authenticated user.",
    data: { user: req.authUser },
  });
});

export const updateProfileController = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    res.status(401).json({ success: false, message: "Authentication required." });
    return;
  }

  const input = parseProfileInput(req.body);
  const user = await updateProfile(req.authUser.id, input);
  req.authUser = user;

  res.status(200).json({
    success: true,
    message: "Profile updated.",
    data: { user },
  });
});

export const logoutController = asyncHandler(async (req: Request, res: Response) => {
  const token = getAccessToken(req);
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      await revokeToken(payload.jti, new Date(payload.exp * 1000));
    } catch {
      // Clear the cookie even when the token is already expired or invalid.
    }
  }

  clearAccessTokenCookie(res);
  res.status(200).json({
    success: true,
    message: "Logged out.",
  });
});
