import pool from "../config/database.js";
import type { OtpRow } from "../types/auth.js";

const OTP_COLUMNS = `
  id::text AS id,
  user_id::text AS user_id,
  otp_hash,
  purpose,
  expires_at,
  attempts,
  verified_at,
  created_at
`;

export async function findLatestOtp(userId: string, purpose: string = "login"): Promise<OtpRow | null> {
  const result = await pool.query<OtpRow>(
    `SELECT ${OTP_COLUMNS}
     FROM otp_verifications
     WHERE user_id = $1 AND purpose = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, purpose],
  );

  return result.rows[0] ?? null;
}

export async function invalidateActiveOtps(userId: string, purpose: string = "login"): Promise<void> {
  await pool.query(
    `UPDATE otp_verifications
     SET expires_at = NOW()
     WHERE user_id = $1
       AND purpose = $2
       AND verified_at IS NULL
       AND expires_at > NOW()`,
    [userId, purpose],
  );
}

export async function createOtp(input: {
  userId: string;
  otpHash: string;
  expiresAt: Date;
  purpose?: string;
}): Promise<OtpRow> {
  const result = await pool.query<OtpRow>(
    `INSERT INTO otp_verifications (user_id, otp_hash, expires_at, purpose)
     VALUES ($1, $2, $3, $4)
     RETURNING ${OTP_COLUMNS}`,
    [input.userId, input.otpHash, input.expiresAt, input.purpose ?? "login"],
  );

  const otp = result.rows[0];
  if (!otp) {
    throw new Error("OTP insert did not return a row");
  }

  return otp;
}

export async function incrementOtpAttempts(id: string): Promise<number> {
  const result = await pool.query<{ attempts: number }>(
    `UPDATE otp_verifications
     SET attempts = attempts + 1
     WHERE id = $1
     RETURNING attempts`,
    [id],
  );

  return result.rows[0]?.attempts ?? 0;
}

export async function markOtpVerified(id: string): Promise<void> {
  await pool.query(
    `UPDATE otp_verifications
     SET verified_at = NOW()
     WHERE id = $1 AND verified_at IS NULL`,
    [id],
  );
}

export async function deleteOtp(id: string): Promise<void> {
  await pool.query(`DELETE FROM otp_verifications WHERE id = $1`, [id]);
}
