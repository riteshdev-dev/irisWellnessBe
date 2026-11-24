ALTER TABLE users
  ADD COLUMN IF NOT EXISTS country VARCHAR(2),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS professional_details TEXT,
  ADD COLUMN IF NOT EXISTS profile_photo VARCHAR(160),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS course_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES course_categories (id),
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  thumbnail VARCHAR(160),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 10000),
  level VARCHAR(20) NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  learning_objectives TEXT NOT NULL DEFAULT '',
  prerequisites TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by BIGINT REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS courses_status_idx ON courses (status);
CREATE INDEX IF NOT EXISTS courses_category_idx ON courses (category_id);

CREATE TABLE IF NOT EXISTS course_modules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, sort_order)
);

CREATE TABLE IF NOT EXISTS lessons (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  module_id BIGINT NOT NULL REFERENCES course_modules (id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('video', 'pdf', 'text')),
  text_content TEXT NOT NULL DEFAULT '',
  media_file VARCHAR(160),
  duration_minutes INTEGER NOT NULL DEFAULT 1 CHECK (duration_minutes > 0 AND duration_minutes <= 600),
  sort_order INTEGER NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (module_id, sort_order)
);

CREATE TABLE IF NOT EXISTS enrollments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id),
  course_id BIGINT NOT NULL REFERENCES courses (id),
  status VARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS enrollments_user_idx ON enrollments (user_id);
CREATE INDEX IF NOT EXISTS enrollments_course_idx ON enrollments (course_id);

CREATE TABLE IF NOT EXISTS lesson_progress (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  enrollment_id BIGINT NOT NULL REFERENCES enrollments (id) ON DELETE CASCADE,
  lesson_id BIGINT NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (enrollment_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS assessments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id BIGINT NOT NULL UNIQUE REFERENCES courses (id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  passing_percentage INTEGER NOT NULL CHECK (passing_percentage BETWEEN 1 AND 100),
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR (duration_minutes > 0 AND duration_minutes <= 300)),
  max_attempts INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts BETWEEN 1 AND 10),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assessment_questions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assessment_id BIGINT NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  marks INTEGER NOT NULL CHECK (marks BETWEEN 1 AND 100),
  sort_order INTEGER NOT NULL,
  UNIQUE (assessment_id, sort_order)
);

CREATE TABLE IF NOT EXISTS assessment_options (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES assessment_questions (id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assessment_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assessment_id BIGINT NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users (id),
  enrollment_id BIGINT NOT NULL REFERENCES enrollments (id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  score INTEGER,
  max_score INTEGER,
  percentage INTEGER,
  passed BOOLEAN
);

CREATE INDEX IF NOT EXISTS attempts_user_idx ON assessment_attempts (user_id);
CREATE INDEX IF NOT EXISTS attempts_assessment_idx ON assessment_attempts (assessment_id);

CREATE TABLE IF NOT EXISTS attempt_answers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id BIGINT NOT NULL REFERENCES assessment_attempts (id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES assessment_questions (id) ON DELETE CASCADE,
  option_id BIGINT NOT NULL REFERENCES assessment_options (id),
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS certificates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  enrollment_id BIGINT NOT NULL UNIQUE REFERENCES enrollments (id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users (id),
  course_id BIGINT NOT NULL REFERENCES courses (id),
  certificate_code VARCHAR(40) NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS certificates_user_idx ON certificates (user_id);

INSERT INTO course_categories (name, description)
VALUES
  ('Thai Massage', 'Traditional Thai massage sequences and assisted stretching.'),
  ('Swedish Massage', 'Classic Swedish strokes for relaxation and circulation.'),
  ('Deep Tissue Massage', 'Focused work for chronic muscle tension.'),
  ('Aromatherapy', 'Essential-oil application within a spa treatment.'),
  ('Foot Reflexology', 'Reflex maps and foot treatment sequences.'),
  ('Spa Hygiene and Safety', 'Sanitation, client safety, and treatment-room standards.'),
  ('Other Spa and Wellness Courses', 'Additional spa and wellness subjects.')
ON CONFLICT (name) DO NOTHING;
