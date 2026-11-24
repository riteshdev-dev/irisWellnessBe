import pool from "../config/database.js";
import type { UserRow } from "../types/auth.js";

const USER_COLUMNS = `
  id::text AS id,
  name,
  email,
  password_hash,
  phone,
  nationality,
  phone_country_code,
  phone_number,
  phone_country_iso2,
  country,
  city,
  state,
  courseids,
  date_of_birth,
  professional_details,
  profile_photo,
  is_active,
  role,
  is_verified,
  created_at,
  updated_at
`;

export async function findUserById(id: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower($1)`,
    [email],
  );

  return result.rows[0] ?? null;
}

export async function findUserByPhone(phone: string): Promise<UserRow | null> {
  const exact = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS}
     FROM users
     WHERE phone = $1
        OR regexp_replace(COALESCE(phone_country_code, ''), '[^0-9]', '', 'g') || COALESCE(phone_number, '') = $1`,
    [phone],
  );

  if (exact.rows[0]) {
    return exact.rows[0];
  }

  const national = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE phone_number = $1`,
    [phone],
  );

  return national.rows.length === 1 ? national.rows[0] : null;
}

export async function createUserWithPassword(input: {
  name: string;
  email: string;
  phone: string;
  phoneCountryCode: string;
  phoneNumber: string;
  phoneCountryIso2: string;
  nationality: string | null;
  country: string | null;
  passwordHash: string;
}): Promise<UserRow> {
  const result = await pool.query<UserRow>(
    `INSERT INTO users (
      name, email, phone, phone_country_code, phone_number,
      phone_country_iso2, nationality, country, password_hash, role, is_active, is_verified
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'USER', true, true)
    RETURNING ${USER_COLUMNS}`,
    [
      input.name,
      input.email,
      input.phone,
      input.phoneCountryCode,
      input.phoneNumber,
      input.phoneCountryIso2,
      input.nationality,
      input.country ?? input.nationality,
      input.passwordHash,
    ],
  );

  const user = result.rows[0];
  if (!user) {
    throw new Error("User insert did not return a row");
  }

  return user;
}

export async function updateUserPassword(
  userId: string,
  passwordHash: string,
): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `UPDATE users
     SET password_hash = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING ${USER_COLUMNS}`,
    [passwordHash, userId],
  );

  return result.rows[0] ?? null;
}

export async function createUser(input: {
  name: string;
  email: string;
  phone: string;
}): Promise<UserRow> {
  const result = await pool.query<UserRow>(
    `INSERT INTO users (name, email, phone, role, is_verified)
     VALUES ($1, $2, $3, 'USER', false)
     RETURNING ${USER_COLUMNS}`,
    [input.name, input.email, input.phone],
  );

  const user = result.rows[0];
  if (!user) {
    throw new Error("User insert did not return a row");
  }

  return user;
}

export async function createAdminUser(input: {
  name: string;
  email: string;
  phone: string;
  passwordHash?: string;
}): Promise<UserRow> {
  const result = await pool.query<UserRow>(
    `INSERT INTO users (name, email, phone, password_hash, role, is_verified)
     VALUES ($1, $2, $3, $4, 'ADMIN', true)
     RETURNING ${USER_COLUMNS}`,
    [input.name, input.email, input.phone, input.passwordHash ?? null],
  );

  const user = result.rows[0];
  if (!user) {
    throw new Error("Admin insert did not return a row");
  }

  return user;
}

export async function updatePendingUser(
  id: string,
  input: { name: string; phone: string },
): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `UPDATE users
     SET name = $1, phone = $2, updated_at = NOW()
     WHERE id = $3 AND is_verified = false
     RETURNING ${USER_COLUMNS}`,
    [input.name, input.phone, id],
  );

  return result.rows[0] ?? null;
}

export async function markUserVerified(id: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `UPDATE users
     SET is_verified = true, updated_at = NOW()
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function updateUserProfile(
  id: string,
  input: {
    name: string;
    phone: string;
    phoneCountryCode: string;
    phoneNumber: string;
    phoneCountryIso2: string;
    country: string | null;
    city: string | null;
    state: string | null;
    courseIds?: string[];
    dateOfBirth: string | null;
    professionalDetails: string | null;
  },
): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `UPDATE users
     SET name = $1,
         phone = $2,
         phone_country_code = $3,
         phone_number = $4,
         phone_country_iso2 = $5,
         country = $6,
         city = $7,
         state = $8,
         courseids = COALESCE($9::text[], courseids),
         date_of_birth = $10::date,
         professional_details = $11,
         updated_at = NOW()
     WHERE id = $12
     RETURNING ${USER_COLUMNS}`,
    [
      input.name,
      input.phone,
      input.phoneCountryCode,
      input.phoneNumber,
      input.phoneCountryIso2,
      input.country,
      input.city,
      input.state,
      input.courseIds ?? null,
      input.dateOfBirth,
      input.professionalDetails,
      id,
    ],
  );

  return result.rows[0] ?? null;
}

export async function updateUserPhoto(id: string, profilePhoto: string | null): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `UPDATE users
     SET profile_photo = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING ${USER_COLUMNS}`,
    [profilePhoto, id],
  );

  return result.rows[0] ?? null;
}

export async function setUserActive(id: string, isActive: boolean): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `UPDATE users
     SET is_active = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING ${USER_COLUMNS}`,
    [isActive, id],
  );

  return result.rows[0] ?? null;
}

export async function promoteUserToAdmin(id: string, passwordHash?: string): Promise<UserRow | null> {
  const query = passwordHash
    ? `UPDATE users SET role = 'ADMIN', password_hash = $1, is_verified = true, updated_at = NOW() WHERE id = $2 RETURNING ${USER_COLUMNS}`
    : `UPDATE users SET role = 'ADMIN', is_verified = true, updated_at = NOW() WHERE id = $1 RETURNING ${USER_COLUMNS}`;
  const params = passwordHash ? [passwordHash, id] : [id];
  const result = await pool.query<UserRow>(query, params);

  return result.rows[0] ?? null;
}

export async function updateUserCourseIds(
  userId: string,
  courseIds: string[],
): Promise<{ id: string; courseids: string[] } | null> {
  const result = await pool.query<{ id: string; courseids: string[] }>(
    `UPDATE users
     SET courseids = $1::text[], updated_at = NOW()
     WHERE id = $2
     RETURNING id::text AS id, courseids`,
    [courseIds, userId],
  );

  return result.rows[0] ?? null;
}
