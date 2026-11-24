import "dotenv/config";
import bcrypt from "bcrypt";
import pool from "../config/database.js";
import { createAdminUser, findUserByEmail, findUserByPhone, promoteUserToAdmin } from "../models/user.model.js";
import { normalizeEmail, normalizeName, normalizePhone } from "../utils/validators.js";

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function fail(message: string): never {
  console.error(message);
  process.exitCode = 1;
  throw new Error(message);
}

async function createAdmin(): Promise<void> {
  const name = normalizeName(readArg("name") ?? "");
  const email = normalizeEmail(readArg("email") ?? "");
  const phone = normalizePhone(readArg("phone") ?? "");
  const rawPassword = readArg("password") ?? "Admin@1234";
  const promote = process.argv.includes("--promote");

  if (!name || !email || !phone) {
    fail(
      "Usage: npm run create-admin -- --name \"Full Name\" --email admin@example.com --phone 919800000000 [--password \"Pass1234\"] [--promote]",
    );
  }

  const passwordHash = await bcrypt.hash(rawPassword, 10);
  const emailOwner = await findUserByEmail(email);
  const phoneOwner = await findUserByPhone(phone);

  if (emailOwner && phoneOwner && emailOwner.id !== phoneOwner.id) {
    fail("Email and mobile number belong to different accounts.");
  }

  const existing = emailOwner ?? phoneOwner;
  if (existing) {
    if (!promote) {
      fail("An account with this email or mobile number already exists. Re-run with --promote to grant ADMIN.");
    }

    const promoted = await promoteUserToAdmin(existing.id, passwordHash);
    console.log(`Promoted ${promoted?.email ?? email} to ADMIN with password.`);
    return;
  }

  const admin = await createAdminUser({ name, email, phone, passwordHash });
  console.log(`Created ADMIN account for ${admin.email} with password.`);
}

try {
  await createAdmin();
} catch (error) {
  if (process.exitCode !== 1) {
    console.error("Could not create admin account:", error);
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
