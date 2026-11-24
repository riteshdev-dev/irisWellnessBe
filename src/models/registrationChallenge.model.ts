import type { PoolClient } from "pg";
import pool from "../config/database.js";
import { AppError } from "../utils/AppError.js";
import { isUniqueViolation } from "../utils/pgError.js";

export interface RegistrationChallengeRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  nationality: string | null;
  phone_country_code: string | null;
  phone_number: string | null;
  phone_country_iso2: string | null;
  otp_hash: string;
  expires_at: Date;
  attempts: number;
  verified_at: Date | null;
  created_at: Date;
}

const CHALLENGE_COLUMNS = `
  id::text AS id,
  name,
  email,
  phone,
  nationality,
  phone_country_code,
  phone_number,
  phone_country_iso2,
  otp_hash,
  expires_at,
  attempts,
  verified_at,
  created_at
`;

export async function findLatestChallenge(email: string): Promise<RegistrationChallengeRow | null> {
  const result = await pool.query<RegistrationChallengeRow>(
    `SELECT ${CHALLENGE_COLUMNS}
     FROM registration_challenges
     WHERE lower(email) = lower($1)
     ORDER BY created_at DESC
     LIMIT 1`,
    [email],
  );

  return result.rows[0] ?? null;
}

export async function invalidateActiveChallenges(email: string): Promise<void> {
  await pool.query(
    `UPDATE registration_challenges
     SET expires_at = NOW()
     WHERE lower(email) = lower($1)
       AND verified_at IS NULL
       AND expires_at > NOW()`,
    [email],
  );
}

export async function createChallenge(input: {
  name: string;
  email: string;
  phone: string;
  phoneCountryCode: string;
  phoneNumber: string;
  phoneCountryIso2: string;
  otpHash: string;
  expiresAt: Date;
}): Promise<RegistrationChallengeRow> {
  const result = await pool.query<RegistrationChallengeRow>(
    `INSERT INTO registration_challenges (
       name, email, phone, nationality, phone_country_code, phone_number, phone_country_iso2, otp_hash, expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${CHALLENGE_COLUMNS}`,
    [
      input.name,
      input.email,
      input.phone,
      input.phoneCountryCode,
      input.phoneNumber,
      input.phoneCountryIso2,
      input.otpHash,
      input.expiresAt,
    ],
  );

  const challenge = result.rows[0];
  if (!challenge) {
    throw new Error("Registration challenge insert did not return a row");
  }

  return challenge;
}

export async function incrementChallengeAttempts(id: string): Promise<number> {
  const result = await pool.query<{ attempts: number }>(
    `UPDATE registration_challenges
     SET attempts = attempts + 1
     WHERE id = $1
     RETURNING attempts`,
    [id],
  );

  return result.rows[0]?.attempts ?? 0;
}

export async function deleteChallenge(id: string): Promise<void> {
  await pool.query("DELETE FROM registration_challenges WHERE id = $1", [id]);
}

async function finishUser(
  client: PoolClient,
  input: {
    name: string;
    email: string;
    phone: string;
    nationality: string;
    phoneCountryCode: string;
    phoneNumber: string;
    phoneCountryIso2: string;
  },
) {
  const existing = await client.query<{ id: string; is_verified: boolean }>(
    "SELECT id::text AS id, is_verified FROM users WHERE lower(email) = lower($1)",
    [input.email],
  );
  const row = existing.rows[0];

  if (row?.is_verified) {
    throw new AppError(409, "An account with this email already exists. Please log in.");
  }

  if (row) {
    await client.query(
      `UPDATE users
       SET name = $1,
           phone = $2,
           nationality = $3,
           phone_country_code = $4,
           phone_number = $5,
           phone_country_iso2 = $6,
           is_verified = true,
           updated_at = NOW()
       WHERE id = $7 AND is_verified = false`,
      [
        input.name,
        input.phone,
        input.nationality,
        input.phoneCountryCode,
        input.phoneNumber,
        input.phoneCountryIso2,
        row.id,
      ],
    );
    return;
  }

  await client.query(
    `INSERT INTO users (
       name, email, phone, nationality, phone_country_code, phone_number, phone_country_iso2, role, is_verified
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'USER', true)`,
    [
      input.name,
      input.email,
      input.phone,
      input.nationality,
      input.phoneCountryCode,
      input.phoneNumber,
      input.phoneCountryIso2,
    ],
  );
}

export async function finalizeRegistration(input: {
  challengeId: string;
  name: string;
  email: string;
  phone: string;
  nationality: string;
  phoneCountryCode: string;
  phoneNumber: string;
  phoneCountryIso2: string;
}): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const consumed = await client.query(
      `UPDATE registration_challenges
       SET verified_at = NOW()
       WHERE id = $1 AND verified_at IS NULL
       RETURNING id`,
      [input.challengeId],
    );

    if (!consumed.rowCount) {
      throw new AppError(400, "This verification code has already been used. Request a new one.");
    }

    await finishUser(client, input);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");

    if (isUniqueViolation(error, "users_email_unique_idx")) {
      throw new AppError(409, "An account with this email already exists. Please log in.");
    }

    if (isUniqueViolation(error, "users_phone_unique_idx")) {
      throw new AppError(409, "An account with this mobile number already exists. Please log in.");
    }

    throw error;
  } finally {
    client.release();
  }
}
