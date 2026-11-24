import bcrypt from "bcrypt";
import { randomInt } from "node:crypto";
import { env } from "../config/env.js";
import {
  createOtp,
  deleteOtp,
  findLatestOtp,
  incrementOtpAttempts,
  invalidateActiveOtps,
  markOtpVerified,
} from "../models/otp.model.js";
import {
  createUserWithPassword,
  findUserByEmail,
  findUserById,
  findUserByPhone,
  updateUserPassword,
  updateUserProfile,
} from "../models/user.model.js";
import type { OtpChallenge, PublicUser, UserRow } from "../types/auth.js";
import { AppError } from "../utils/AppError.js";
import { maskEmail } from "../utils/mask.js";
import { assertRole, toPublicUser } from "../utils/userMapper.js";
import type { ProfileInput, ResetPasswordInput, SignupInput } from "../utils/validators.js";
import { deliverOtp } from "./otpDelivery.service.js";
import { signAccessToken, signChallengeToken, verifyChallengeToken } from "./token.service.js";

const sendHistory = new Map<string, number[]>();

function recentSends(key: string): number[] {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  return (sendHistory.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
}

function assertSendAllowance(key: string): void {
  if (recentSends(key).length >= 5) {
    throw new AppError(429, "Too many verification codes were requested. Please try again later.", {
      retryAfterSeconds: 60,
    });
  }
}

function recordSend(key: string): void {
  const recent = recentSends(key);
  recent.push(Date.now());
  sendHistory.set(key, recent);
}

async function assertCooldown(createdAt: Date | undefined): Promise<void> {
  if (!createdAt) {
    return;
  }

  const elapsedMs = Date.now() - createdAt.getTime();
  const cooldownMs = env().otpResendCooldownSeconds * 1000;
  if (elapsedMs < cooldownMs) {
    throw new AppError(429, "Please wait before requesting another verification code.", {
      retryAfterSeconds: Math.max(1, Math.ceil((cooldownMs - elapsedMs) / 1000)),
    });
  }
}

function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export const REGISTRATION_SUCCESS_MESSAGE = "Registration successful. Please log in.";

export async function signup(input: SignupInput): Promise<{ message: string }> {
  const emailOwner = await findUserByEmail(input.email);
  if (emailOwner) {
    throw new AppError(409, "An account with this email already exists. Please log in.");
  }

  const phoneOwner = await findUserByPhone(input.phone);
  if (phoneOwner) {
    throw new AppError(409, "An account with this mobile number already exists. Please log in.");
  }

  const passwordHash = await bcrypt.hash(input.password, env().bcryptRounds);

  await createUserWithPassword({
    name: input.name,
    email: input.email,
    phone: input.phone,
    phoneCountryCode: input.phoneCountryCode,
    phoneNumber: input.phoneNumber,
    phoneCountryIso2: input.phoneCountryIso2,
    nationality: input.nationality,
    country: input.country,
    passwordHash,
  });

  return { message: REGISTRATION_SUCCESS_MESSAGE };
}

export async function loginWithPassword(email: string, password: string): Promise<OtpChallenge> {
  const user = await findUserByEmail(email);
  if (!user) {
    throw new AppError(401, "Invalid email or password.");
  }

  if (!user.password_hash) {
    throw new AppError(
      400,
      "Password has not been configured for this account. Please use Forgot Password to set your password.",
    );
  }

  if (!user.is_active) {
    throw new AppError(403, "Your account has been deactivated. Please contact support.");
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    throw new AppError(401, "Invalid email or password.");
  }

  return await issueLoginOtp(user);
}

export async function issueLoginOtp(user: UserRow): Promise<OtpChallenge> {
  const config = env();
  assertSendAllowance(`login:${user.id}`);

  const latest = await findLatestOtp(user.id, "login");
  await assertCooldown(latest?.created_at);

  const code = generateOtpCode();
  const otpHash = await bcrypt.hash(code, config.bcryptRounds);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await invalidateActiveOtps(user.id, "login");
  const otp = await createOtp({ userId: user.id, otpHash, expiresAt, purpose: "login" });

  try {
    await deliverOtp(
      { name: user.name, email: user.email, phone: user.phone },
      code,
    );
    recordSend(`login:${user.id}`);
  } catch (error) {
    await deleteOtp(otp.id);
    throw error;
  }

  const challengeToken = signChallengeToken(user.id, "login");

  return {
    challengeToken,
    maskedDestination: maskEmail(user.email),
    expiresInSeconds: 300,
    resendAvailableInSeconds: config.otpResendCooldownSeconds,
  };
}

export async function verifyLoginOtp(
  challengeToken: string,
  otp: string,
): Promise<{ user: PublicUser; token: string }> {
  const payload = verifyChallengeToken(challengeToken, "login");
  const user = await findUserById(payload.sub);
  if (!user || !user.is_active) {
    throw new AppError(401, "Account not found or inactive.");
  }

  const record = await findLatestOtp(user.id, "login");
  if (!record || record.verified_at !== null || new Date(record.expires_at).getTime() < Date.now()) {
    throw new AppError(400, "Verification code has expired. Please request a new code.");
  }

  if (record.attempts >= 5) {
    throw new AppError(429, "Too many failed attempts. Please request a new verification code.");
  }

  const isValid = await bcrypt.compare(otp, record.otp_hash);
  const attempts = await incrementOtpAttempts(record.id);

  if (!isValid) {
    const remaining = Math.max(0, 5 - attempts);
    if (remaining === 0) {
      throw new AppError(429, "Too many failed attempts. Please request a new verification code.", {
        attemptsRemaining: 0,
      });
    }
    throw new AppError(400, "Invalid verification code.", { attemptsRemaining: remaining });
  }

  await markOtpVerified(record.id);
  await invalidateActiveOtps(user.id, "login");

  const token = signAccessToken(user.id, assertRole(user.role));
  return { user: toPublicUser(user), token };
}

export async function resendLoginOtp(challengeToken: string): Promise<OtpChallenge> {
  const payload = verifyChallengeToken(challengeToken, "login");
  const user = await findUserById(payload.sub);
  if (!user || !user.is_active) {
    throw new AppError(401, "Account not found or inactive.");
  }

  return await issueLoginOtp(user);
}

export async function requestPasswordReset(email: string): Promise<OtpChallenge> {
  const config = env();
  const user = await findUserByEmail(email);

  if (!user || !user.is_active) {
    // Return dummy challenge info to prevent email enumeration
    return {
      challengeToken: "",
      maskedDestination: maskEmail(email),
      expiresInSeconds: 300,
      resendAvailableInSeconds: config.otpResendCooldownSeconds,
    };
  }

  assertSendAllowance(`reset:${user.id}`);
  const latest = await findLatestOtp(user.id, "reset_password");
  await assertCooldown(latest?.created_at);

  const code = generateOtpCode();
  const otpHash = await bcrypt.hash(code, config.bcryptRounds);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await invalidateActiveOtps(user.id, "reset_password");
  const otp = await createOtp({ userId: user.id, otpHash, expiresAt, purpose: "reset_password" });

  try {
    await deliverOtp(
      { name: user.name, email: user.email, phone: user.phone },
      code,
    );
    recordSend(`reset:${user.id}`);
  } catch (error) {
    await deleteOtp(otp.id);
    throw error;
  }

  const challengeToken = signChallengeToken(user.id, "reset_password");

  return {
    challengeToken,
    maskedDestination: maskEmail(user.email),
    expiresInSeconds: 300,
    resendAvailableInSeconds: config.otpResendCooldownSeconds,
  };
}

export async function resetPassword(input: ResetPasswordInput): Promise<{ message: string }> {
  if (!input.challengeToken) {
    throw new AppError(400, "Invalid or expired password reset session.");
  }

  const payload = verifyChallengeToken(input.challengeToken, "reset_password");
  const user = await findUserById(payload.sub);
  if (!user || !user.is_active) {
    throw new AppError(400, "Account not found or inactive.");
  }

  const record = await findLatestOtp(user.id, "reset_password");
  if (!record || record.verified_at !== null || new Date(record.expires_at).getTime() < Date.now()) {
    throw new AppError(400, "Verification code has expired. Please request a new code.");
  }

  if (record.attempts >= 5) {
    throw new AppError(429, "Too many failed attempts. Please request a new verification code.");
  }

  const isValid = await bcrypt.compare(input.otp, record.otp_hash);
  const attempts = await incrementOtpAttempts(record.id);

  if (!isValid) {
    const remaining = Math.max(0, 5 - attempts);
    if (remaining === 0) {
      throw new AppError(429, "Too many failed attempts. Please request a new verification code.", {
        attemptsRemaining: 0,
      });
    }
    throw new AppError(400, "Invalid verification code.", { attemptsRemaining: remaining });
  }

  await markOtpVerified(record.id);
  await invalidateActiveOtps(user.id, "reset_password");

  const passwordHash = await bcrypt.hash(input.password, env().bcryptRounds);
  await updateUserPassword(user.id, passwordHash);

  return { message: "Password reset successful. Please log in with your new password." };
}

export async function updateProfile(userId: string, input: ProfileInput): Promise<PublicUser> {
  const existing = await findUserById(userId);
  if (!existing) {
    throw new AppError(404, "User not found.");
  }

  const phoneOwner = await findUserByPhone(input.phone);
  if (phoneOwner && phoneOwner.id !== userId) {
    throw new AppError(409, "An account with this mobile number already exists.");
  }

  const updated = await updateUserProfile(userId, input);
  if (!updated) {
    throw new AppError(500, "Profile could not be updated.");
  }

  return toPublicUser(updated);
}
