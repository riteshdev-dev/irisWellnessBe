# Iris Wellness — Backend API (`spaTherapistBe`)

A high-performance, enterprise-grade RESTful API service powering **Iris Wellness**, built with **Node.js**, **Express 5**, **TypeScript**, and **PostgreSQL**. The service provides secure authentication, role-based access control, curriculum streaming, online exam evaluation, automated PDF certificate generation with QR verification, media asset storage, and an administrative management suite.

---

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Architecture & Folder Structure](#architecture--folder-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Install Dependencies](#2-install-dependencies)
  - [3. PostgreSQL Setup with pgAdmin 4](#3-postgresql-setup-with-pgadmin-4)
  - [4. Environment Variables Configuration](#4-environment-variables-configuration)
  - [5. Baseline Database Initialization & Migrations](#5-baseline-database-initialization--migrations)
  - [6. Seed Initial Admin Account](#6-seed-initial-admin-account)
  - [7. Start the Backend Server](#7-start-the-backend-server)
- [Database Schema & Migrations](#database-schema--migrations)
- [Authentication, Security & Session Expiration](#authentication-security--session-expiration)
  - [Dual Authentication (Password & OTP)](#dual-authentication-password--otp)
  - [15-Minute User Inactivity & Token Revocation](#15-minute-user-inactivity--token-revocation)
- [File Storage Architecture](#file-storage-architecture)
  - [Directory Tree](#directory-tree)
  - [Auto-Creation & Access Control](#auto-creation--access-control)
  - [Git Exclusions (`.gitignore`)](#git-exclusions-gitignore)
- [Certificate Generation & Manual Regeneration](#certificate-generation--manual-regeneration)
- [Complete API Endpoints Reference](#complete-api-endpoints-reference)
- [Common Setup Issues & Troubleshooting](#common-setup-issues--troubleshooting)

---

## Overview

The `spaTherapistBe` backend service manages the core data models and business workflows for wellness therapy certification:
- **Identity & Access Management**: Secure registration with international dialing validation, OTP challenges via SMTP or console, bcrypt password hashing, and role separation (`USER` and `ADMIN`).
- **Learning Management**: Course categories, multi-module curriculums, lesson sequencing, video streaming (`MP4`, `WebM`), and course PDF manual distribution.
- **Assessment Engine**: Timed examination attempts, dynamic question loading, automated score calculation against passing criteria, retake provisioning, and attempt tracking.
- **Certification Authority**: Vector PDF certificate rendering using `PDFKit`, unique certificate numbering, QR code verification signing, and manual regeneration with audit logging.
- **Protected File Storage**: User-partitioned certificate storage (`public/documents/user-{userId}/`) and dedicated media directories (`public/course/`, `public/video/`).

---

## Technology Stack

| Category | Technology | Purpose |
|---|---|---|
| **Runtime** | [Node.js](https://nodejs.org/) (v18+ or v20 LTS) | Server-side JavaScript execution environment |
| **Framework** | [Express 5](https://expressjs.com/) | High-throughput HTTP server with modern routing |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) | Strict static typing and code reliability |
| **Database** | [PostgreSQL 14+](https://www.postgresql.org/) | Relational database with JSONB and array support |
| **DB Driver & Pool** | [pg (node-postgres)](https://node-postgres.com/) | Connection pooling and parameterized SQL queries |
| **Auth & Cryptography** | `jsonwebtoken`, `bcrypt` | JWT session issuance and password hashing |
| **Document Generation** | [PDFKit](https://pdfkit.org/) | Vector graphics, typography, and PDF certificate compilation |
| **QR Code Engine** | [qrcode](https://www.npmjs.com/package/qrcode) | Verification link embedding on certificates |
| **Email Transport** | [Nodemailer](https://nodemailer.com/) | SMTP transport for OTP verification delivery |
| **File Uploads** | [Multer](https://github.com/expressjs/multer) | Multipart file handling for PDFs and course videos |
| **Development Tooling** | `tsx` | TypeScript execution and hot-reloading watch runner |

---

## Architecture & Folder Structure

```text
spaTherapistBe/
├── public/                     # Static media and generated documents
│   ├── course/                 # Course PDF training manuals
│   ├── video/                  # Course training videos (MP4, WebM)
│   └── documents/              # User certificate PDFs organized by User ID
│       └── user-{userId}/      # E.g., user-101/certificate-thai-massage.pdf
├── src/
│   ├── config/                 # System configuration
│   │   ├── database.ts         # pg connection pool configuration
│   │   ├── env.ts              # Zod / environment variable schema & validation
│   │   └── mailer.ts           # Nodemailer SMTP transporter setup
│   ├── controllers/            # HTTP request controllers
│   │   ├── admin.controller.ts # Course, curriculum, exam, user, and report handlers
│   │   ├── auth.controller.ts  # Signup, login, OTP dispatch, verify, and logout
│   │   ├── documentAccess.controller.ts # Secured user document download controller
│   │   └── portal.controller.ts# Learner course progress, exam attempts, certificates
│   ├── db/                     # Database migrations and migration runner
│   │   ├── migrations/         # SQL migration scripts (001 - 006)
│   │   └── migrate.ts          # Migration executor (`npm run migrate`)
│   ├── middleware/             # Express middlewares
│   │   ├── auth.ts             # JWT authentication & role-based authorization guards
│   │   ├── error.ts            # Centralized exception handler
│   │   └── upload.ts           # Multer disk storage configurations
│   ├── models/                 # Database query models & repositories
│   │   ├── admin.model.ts      # Administrative analytics and reporting queries
│   │   ├── assessment.model.ts # Question banks, attempts, and scoring logic
│   │   ├── certificate.model.ts# Certificate persistence and regeneration logs
│   │   ├── course.model.ts     # Courses, modules, and lessons CRUD
│   │   └── user.model.ts       # User accounts, tokens, and verification status
│   ├── routes/                 # Express router mounts
│   │   ├── admin.routes.ts     # Protected routes for `/api/admin/*`
│   │   ├── auth.routes.ts      # Authentication endpoints `/api/auth/*`
│   │   ├── portal.routes.ts    # Learner endpoints `/api/portal/*`
│   │   └── public.routes.ts    # Public certificate verification `/api/public/*`
│   ├── scripts/                # Administrative CLI utilities
│   │   └── createAdmin.ts      # Initial admin account bootstrap script
│   ├── services/               # Core business services
│   │   ├── certificate.service.ts # PDFKit certificate rendering engine
│   │   ├── otp.service.ts      # OTP generation, hashing, and SMTP dispatch
│   │   ├── portal.service.ts   # Exam grading and retake management
│   │   └── storage.service.ts  # Directory creation and file slug generation
│   ├── types/                  # TypeScript interface definitions
│   ├── utils/                  # String normalization and custom AppError
│   └── server.ts               # Express application entry point
├── .env.example                # Template for environment settings
├── package.json                # Project dependencies and CLI scripts
└── tsconfig.json               # TypeScript configuration
```

---

## Prerequisites

Before starting, ensure your system has the following components installed and running:
- **Node.js**: `v18.0.0` or higher (`v20.x` LTS recommended)
- **npm**: `v9.0.0` or higher
- **PostgreSQL**: `v14.0` or higher (installed locally or via Docker)
- **pgAdmin 4**: Recommended GUI client for PostgreSQL management

---

## Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd spaTherapistPortal/spaTherapistBe
```

### 2. Install Dependencies

```bash
npm install
```

---

### 3. PostgreSQL Setup with pgAdmin 4

1. Open **pgAdmin 4** on your machine.
2. In the left navigation tree, expand your PostgreSQL server (e.g., `PostgreSQL 15`).
3. Right-click on **Databases** -> Select **Create** -> **Database...**.
4. In the dialog, set:
   - **Database**: `spatherapi` (or your preferred database name)
   - **Owner**: `postgres` (or your PostgreSQL user)
5. Click **Save**.

Alternatively, create the database via standard `psql` command line:

```sql
CREATE DATABASE spatherapi;
```

---

### 4. Environment Variables Configuration

Copy the sample `.env.example` file to create your active `.env` configuration:

```bash
# Windows PowerShell
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

Open `.env` and fill in your local PostgreSQL, JWT, and SMTP settings:

```env
# Server Settings
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173

# PostgreSQL Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=spatherapi
DB_USER=postgres
DB_PASSWORD=your_postgres_password

# Authentication & Security
# Generate a secure 32+ character string
JWT_SECRET=spa_therapist_super_secret_jwt_key_at_least_32_characters_long
JWT_EXPIRES_IN=12h
BCRYPT_ROUNDS=10

# OTP Delivery Settings
# Options: console | email | sms | both
# In development, 'console' prints OTP directly to your terminal.
OTP_PROVIDER=console
OTP_EXPIRES_MINUTES=5
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN_SECONDS=60

# Email SMTP Settings (Required when OTP_PROVIDER=email or both)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_specific_password
SMTP_FROM="Iris Wellness" <no-reply@iriswellness.com>
```

> [!TIP]
> Setting `OTP_PROVIDER=console` allows developers to test registration and login without configuring live SMTP credentials. The 6-digit OTP will be logged directly to the server terminal output.

---

### 5. Baseline Database Initialization & Migrations

If setting up on a brand new, empty PostgreSQL database, open pgAdmin's **Query Tool** on `spatherapi` and execute the baseline `users` table definition once:

```sql
-- Baseline Users Table Definition
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  password_hash VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'USER',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  phone_country_code VARCHAR(10),
  phone_number VARCHAR(50),
  phone_country_iso2 VARCHAR(10),
  nationality VARCHAR(100),
  country VARCHAR(100),
  city VARCHAR(100),
  state VARCHAR(100),
  courseids TEXT[],
  date_of_birth DATE,
  professional_details JSONB,
  profile_photo VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Next, execute the automated schema migrations from the terminal:

```bash
npm run migrate
```

This runs `src/db/migrate.ts`, applying all migrations in sequential order:
- `001_otp_verifications.sql`: OTP challenge logging and verification tracking.
- `002_revoked_tokens.sql`: Blacklist table for invalidated session tokens on logout.
- `003_registration_challenges.sql`: Pre-registration challenge tokens.
- `004_nationality_phone.sql`: National identity and international dial codes.
- `004_password_auth.sql`: Password hashing integration for dual auth.
- `005_learning_portal.sql`: Courses, categories, modules, lessons, enrollments, assessments, questions, options, attempts, and initial certificates.
- `006_certificate_regeneration.sql`: Certificate versioning, custom recipient names, and immutable audit logs.

---

### 6. Seed Initial Admin Account

Run the dedicated administrative bootstrap script to create your first platform administrator:

```bash
npm run create-admin -- --name "Master Administrator" --email admin@example.com --phone 919800000000 --password "Admin@1234"
```

To promote an existing user account to `ADMIN`, append `--promote`:

```bash
npm run create-admin -- --name "Master Administrator" --email admin@example.com --phone 919800000000 --password "Admin@1234" --promote
```

---

### 7. Start the Backend Server

#### Development Mode (with Hot Reloading)
```bash
npm run dev
```

#### Production Mode
```bash
# 1. Compile TypeScript to JavaScript in /dist
npm run build

# 2. Start optimized server
npm start
```

The server initializes on `http://localhost:5000` with the following confirmation message:
```text
[INFO] Server running in development mode on port 5000
[INFO] Database connected successfully to spatherapi
```

---

## Database Schema & Migrations

| Table Name | Description |
|---|---|
| `users` | User accounts, roles (`USER`, `ADMIN`), international phone numbers, nationality, and profile metadata. |
| `otp_verifications` | Hashed 6-digit OTP codes, expiration timestamps, and retry attempt counters. |
| `revoked_tokens` | Blacklisted JWT session tokens invalidated by user logout or inactivity timeout. |
| `registration_challenges` | Temporary registration state tokens during multi-step registration. |
| `course_categories` | Curriculum groupings (e.g., *Swedish Massage*, *Aromatherapy*, *Ayurvedic Healing*). |
| `courses` | Course catalog, descriptions, duration, thumbnail image, PDF syllabus path, and promo video path. |
| `course_modules` | Structured chapters or units belonging to a specific course. |
| `lessons` | Individual lessons containing training video streaming paths (`.mp4`, `.webm`) and reading notes. |
| `enrollments` | Student course registrations and percentage progress tracking. |
| `lesson_progress` | Per-lesson completion tracking for student enrolled courses. |
| `assessments` | Course exams specifying duration (minutes), passing score percentage, and maximum attempts. |
| `assessment_questions` | Question bank entries with mark weightings. |
| `assessment_options` | Multiple-choice options linked to questions with correct-answer flags. |
| `assessment_attempts` | Student exam submissions, scores achieved, percentage, and pass/fail outcome. |
| `certificates` | Official certification records with unique certificate numbers and stored PDF file paths. |
| `certificate_audit_logs` | Immutable audit trail of administrative certificate modifications and manual regenerations. |

---

## Authentication, Security & Session Expiration

### Dual Authentication (Password & OTP)
- **Password Authentication**: Users and Administrators can log in using their registered Email or Phone with their password. Passwords are salted and hashed using **bcrypt** (10 rounds).
- **OTP Authentication**: Users can request a one-time password sent to their registered contact channel. The OTP expires in 5 minutes and is secured against brute force (maximum 5 attempts).

### 15-Minute User Inactivity & Token Revocation
1. The frontend monitors user interactions (mouse, keyboard, scroll, touch).
2. If inactive for **15 consecutive minutes**, the client invokes `POST /api/auth/logout`.
3. The backend:
   - Reads the caller's JWT token from the `Authorization: Bearer <token>` header.
   - Inserts the token into the `revoked_tokens` table with its expiry timestamp.
   - Any future request bearing this token is rejected with `HTTP 401 Unauthorized`.
4. Stale revoked tokens are automatically pruned during server startup to maintain clean database performance.

---

## File Storage Architecture

### Directory Tree

The backend stores course media and generated student certificates under `public/`:

```text
spaTherapistBe/
└── public/
    ├── course/                           # Course PDF training manuals
    │   ├── Thai-Massage-Basics.pdf
    │   └── Body-Massage-Training.pdf
    │
    ├── video/                            # Course training videos (MP4, WebM)
    │   ├── Thai-Massage-Introduction.mp4
    │   └── Swedish-Techniques.mp4
    │
    └── documents/                        # User-specific certificate folders
        ├── user-101/
        │   ├── certificate-thai-massage.pdf
        │   └── certificate-body-therapy.pdf
        │
        └── user-102/
            └── certificate-swedish-massage.pdf
```

### Auto-Creation & Access Control

- **Auto-Creation**: Folders (`public/course/`, `public/video/`, and `public/documents/user-{userId}/`) are **automatically created** via Node.js `fs.mkdirSync({ recursive: true })` whenever a file upload or certificate generation is initiated.
- **Course & Video Media**: Accessible at `/course/*` and `/video/*` via authenticated static middleware.
- **Documents Directory Security**: `public/documents/` is **strictly protected** and not served statically. Access is governed by `documentAccessController`:
  - Administrators can view any student's certificate.
  - Normal users (`USER`) can **only** access files inside their own `user-{userId}` directory matching their authenticated token ID (`req.authUser.id`).

### Git Exclusions (`.gitignore`)

The backend `.gitignore` ensures that runtime uploads and certificates are never committed to version control:

```gitignore
node_modules/
dist/
.env
logs/
*.log

# Public runtime file uploads and certificates
public/course/*
!public/course/.gitkeep
public/video/*
!public/video/.gitkeep
public/documents/*
!public/documents/.gitkeep
```

---

## Certificate Generation & Manual Regeneration

1. **Automatic Issuance**:
   - When a student completes an assessment with a score $\ge$ `passing_percentage`, `portalService.submitAttempt` automatically triggers certificate compilation.
   - The certificate is rendered using `PDFKit` with high-resolution layout, recipient name, course name, issue date, unique certificate number, and a dynamic verification QR code pointing to `/certificates/verify/{certificateCode}`.
   - The file is saved directly to `public/documents/user-{userId}/certificate-{courseSlug}.pdf`.
2. **Manual Regeneration by Administrator**:
   - In **Admin -> Certificate Management**, admins can view existing certificates or click **Regenerate Certificate**.
   - Allows correcting typographical errors in the recipient's name or updating issue dates.
   - Increments the certificate `version`, writes a new PDF file, updates the database record, and writes an entry into `certificate_audit_logs` detailing the administrator ID, reason, and previous values.

---

## Complete API Endpoints Reference

### Authentication Endpoints (`/api/auth`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register new therapist account and dispatch OTP challenge |
| `POST` | `/api/auth/verify-otp` | Public | Verify 6-digit OTP code to activate account |
| `POST` | `/api/auth/resend-otp` | Public | Request a fresh OTP with cooldown throttle |
| `POST` | `/api/auth/login` | Public | Dual login with password or OTP initiation |
| `POST` | `/api/auth/forgot-password` | Public | Dispatch password reset OTP |
| `POST` | `/api/auth/reset-password` | Public | Reset account password with verified OTP |
| `POST` | `/api/auth/logout` | Authenticated | Revoke current JWT session token and blacklist it |
| `GET` | `/api/auth/me` | Authenticated | Return authenticated user identity and role |

### Public Endpoints (`/api/public`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/public/certificates/verify/:code` | Public | Validate certificate authenticity by code or QR scan |

### Learner Portal Endpoints (`/api/portal`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/portal/dashboard` | `USER` | Learner progress overview, active courses, certificates |
| `GET` | `/api/portal/profile` | `USER` | Get therapist profile details |
| `PUT` | `/api/portal/profile` | `USER` | Update therapist profile, nationality, and contact |
| `GET` | `/api/portal/courses` | `USER` | List enrolled courses and curriculum |
| `GET` | `/api/portal/courses/:courseId` | `USER` | Get course modules, lessons, video URLs, and PDF manuals |
| `POST` | `/api/portal/lessons/:lessonId/complete`| `USER` | Mark lesson progress as completed |
| `GET` | `/api/portal/assessments` | `USER` | List course assessments, eligibility, and scores |
| `POST` | `/api/portal/assessments/:id/start` | `USER` | Begin timed assessment attempt and load question paper |
| `POST` | `/api/portal/assessments/:attemptId/submit`| `USER`| Submit answered questions, calculate grade, issue certificate |
| `GET` | `/api/portal/certificates` | `USER` | List student's earned certificates |
| `GET` | `/api/portal/documents/:userId/:fileName`| `USER` | Download certificate PDF (restricted to own User ID) |

### Administrative Endpoints (`/api/admin`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/admin/dashboard` | `ADMIN` | Platform metrics, enrollments, pass rates, active users |
| `GET` | `/api/admin/courses` | `ADMIN` | List all courses with category details |
| `POST` | `/api/admin/courses` | `ADMIN` | Create new course with PDF and video uploads |
| `PUT` | `/api/admin/courses/:id` | `ADMIN` | Update course metadata, status, or media files |
| `DELETE` | `/api/admin/courses/:id` | `ADMIN` | Remove course from catalog |
| `GET` | `/api/admin/curriculum/:courseId` | `ADMIN` | Get modules and lessons for curriculum editor |
| `POST` | `/api/admin/modules` | `ADMIN` | Create module in a course |
| `POST` | `/api/admin/lessons` | `ADMIN` | Create lesson with attached video or PDF asset |
| `GET` | `/api/admin/assessments` | `ADMIN` | List all exams and question counts |
| `POST` | `/api/admin/assessments` | `ADMIN` | Create or update exam settings (duration, pass mark) |
| `POST` | `/api/admin/assessments/:id/questions` | `ADMIN` | Add or update question and answer options |
| `DELETE` | `/api/admin/questions/:id` | `ADMIN` | Remove question from question bank |
| `GET` | `/api/admin/users` | `ADMIN` | List registered therapist users with filters |
| `PUT` | `/api/admin/users/:id/status` | `ADMIN` | Toggle user active / suspended status |
| `POST` | `/api/admin/enrollments` | `ADMIN` | Manually assign course to student |
| `GET` | `/api/admin/certificates` | `ADMIN` | View all issued certificates |
| `POST` | `/api/admin/certificates/:id/regenerate`| `ADMIN`| Manually regenerate certificate with audit log |
| `GET` | `/api/admin/reports` | `ADMIN` | Export certification completion reports |

---

## Common Setup Issues & Troubleshooting

### 1. `database "spatherapi" does not exist`
- **Cause**: PostgreSQL database has not been created yet.
- **Fix**: Open pgAdmin 4 or `psql` and execute `CREATE DATABASE spatherapi;`. Confirm `DB_NAME` in `.env` matches.

### 2. `password authentication failed for user "postgres"`
- **Cause**: Incorrect database password specified in `.env`.
- **Fix**: Update `DB_PASSWORD` in `.env` to match your local PostgreSQL `postgres` superuser password.

### 3. `relation "users" does not exist` during `npm run migrate`
- **Cause**: Running migrations on a fresh DB before creating the baseline `users` table.
- **Fix**: Run the baseline `CREATE TABLE IF NOT EXISTS users (...)` script provided in [Section 5](#5-baseline-database-initialization--migrations) using pgAdmin Query Tool, then re-run `npm run migrate`.

### 4. `JWT_SECRET must be at least 32 characters long`
- **Cause**: Environment variable validation requires high-entropy secrets for cryptographic security.
- **Fix**: Set `JWT_SECRET` in `.env` to a long string (minimum 32 characters).

### 5. Port 5000 Already in Use (`EADDRINUSE`)
- **Cause**: Another service or a background Node process is listening on port 5000.
- **Fix (Windows PowerShell)**:
  ```powershell
  Get-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess | Stop-Process -Force
  ```
- **Fix (macOS / Linux)**:
  ```bash
  kill -9 $(lsof -t -i:5000)
  ```

---

## License

Confidential and proprietary. Developed for Iris Wellness.
