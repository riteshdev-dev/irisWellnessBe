ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE otp_verifications
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(30) NOT NULL DEFAULT 'login';

CREATE INDEX IF NOT EXISTS otp_verifications_user_purpose_idx
  ON otp_verifications (user_id, purpose, created_at DESC);
