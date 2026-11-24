import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on("connect", () => {
  console.log("PostgreSQL connected successfully!");
});

pool.on("error", (error) => {
  console.error("PostgreSQL connection error:", error);
});

export async function initAuthDatabase(): Promise<void> {
  try {
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS password_hash TEXT;

      ALTER TABLE otp_verifications
        ADD COLUMN IF NOT EXISTS purpose VARCHAR(30) NOT NULL DEFAULT 'login';

      CREATE INDEX IF NOT EXISTS otp_verifications_user_purpose_idx
        ON otp_verifications (user_id, purpose, created_at DESC);
    `);
    console.log("Auth database schema initialized successfully.");
  } catch (error) {
    console.error("Auth database initialization error:", error);
  }
}

// Automatically ensure auth schema exists
initAuthDatabase().catch((err) => {
  console.error("Failed to run initAuthDatabase:", err);
});

export default pool;
