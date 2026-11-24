ALTER TABLE certificates ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(160) DEFAULT NULL;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS pdf_path VARCHAR(255) DEFAULT NULL;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS certificate_audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  certificate_id BIGINT NOT NULL REFERENCES certificates (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  certificate_code VARCHAR(40) NOT NULL,
  previous_name VARCHAR(160) NOT NULL,
  new_name VARCHAR(160) NOT NULL,
  previous_issued_at TIMESTAMPTZ NOT NULL,
  new_issued_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  admin_id BIGINT NOT NULL REFERENCES users (id),
  admin_name VARCHAR(160) NOT NULL,
  admin_email VARCHAR(255) NOT NULL,
  previous_pdf_path VARCHAR(255),
  new_pdf_path VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS certificate_audit_logs_cert_id_idx ON certificate_audit_logs (certificate_id);
