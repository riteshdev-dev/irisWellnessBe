import { randomBytes } from "node:crypto";
import pool from "../config/database.js";
import type { Page } from "./catalog.model.js";

export async function findCertificateByEnrollment(enrollmentId: string) {
  const result = await pool.query(
    `SELECT id::text AS id, certificate_code, issued_at
     FROM certificates WHERE enrollment_id = $1`,
    [enrollmentId],
  );
  return result.rows[0] ?? null;
}

export async function insertCertificate(input: {
  enrollmentId: string;
  userId: string;
  courseId: string;
  code: string;
}) {
  const result = await pool.query(
    `INSERT INTO certificates (enrollment_id, user_id, course_id, certificate_code)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (enrollment_id) DO NOTHING
     RETURNING id::text AS id, certificate_code, issued_at`,
    [input.enrollmentId, input.userId, input.courseId, input.code],
  );
  if (result.rows[0]) {
    return result.rows[0];
  }
  return findCertificateByEnrollment(input.enrollmentId);
}

export function newCertificateCode(): string {
  return `STC-${new Date().getUTCFullYear()}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

export async function listUserCertificates(userId: string) {
  const result = await pool.query(
    `SELECT
        cert.id::text AS id,
        cert.certificate_code,
        cert.issued_at,
        cert.status,
        cert.version,
        c.id::text AS course_id,
        c.title AS course_title,
        COALESCE(cert.recipient_name, u.name) AS therapist_name
     FROM certificates cert
     JOIN courses c ON c.id = cert.course_id
     JOIN users u ON u.id = cert.user_id
     WHERE cert.user_id = $1
       AND cert.status = 'active'
       AND cert.course_id::text = ANY(u.courseids)
     ORDER BY cert.issued_at DESC`,
    [userId],
  );

  return result.rows;
}

export async function findCertificate(id: string) {
  const result = await pool.query(
    `SELECT cert.id::text AS id, cert.user_id::text AS user_id, cert.certificate_code, cert.issued_at,
            cert.status, cert.version, cert.pdf_path, cert.updated_at,
            c.id::text AS course_id, c.title AS course_title,
            u.id::text AS user_id, u.email,
            COALESCE(cert.recipient_name, u.name) AS therapist_name,
            u.name AS original_user_name
     FROM certificates cert
     JOIN courses c ON c.id = cert.course_id
     JOIN users u ON u.id = cert.user_id
     WHERE cert.id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function findCertificateByCode(code: string) {
  const result = await pool.query(
    `SELECT cert.id::text AS id, cert.certificate_code, cert.issued_at, cert.status, cert.version,
            c.title AS course_title, COALESCE(cert.recipient_name, u.name) AS therapist_name
     FROM certificates cert
     JOIN courses c ON c.id = cert.course_id
     JOIN users u ON u.id = cert.user_id
     WHERE cert.certificate_code = $1`,
    [code],
  );
  return result.rows[0] ?? null;
}

export async function listAdminCertificates(input: { q?: string; page: Page }) {
  const values: unknown[] = [];
  const filter = input.q
    ? `WHERE u.name ILIKE $1 OR cert.recipient_name ILIKE $1 OR u.email ILIKE $1 OR c.title ILIKE $1 OR cert.certificate_code ILIKE $1`
    : "";
  if (input.q) values.push(`%${input.q}%`);
  const count = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM certificates cert
     JOIN users u ON u.id = cert.user_id
     JOIN courses c ON c.id = cert.course_id
     ${filter}`,
    values,
  );
  const rows = await pool.query(
    `SELECT cert.id::text AS id, cert.certificate_code, cert.issued_at, cert.status, cert.version, cert.pdf_path,
            COALESCE(cert.recipient_name, u.name) AS therapist_name,
            u.name AS original_user_name,
            u.email, c.id::text AS course_id, c.title AS course_title
     FROM certificates cert
     JOIN users u ON u.id = cert.user_id
     JOIN courses c ON c.id = cert.course_id
     ${filter}
     ORDER BY cert.issued_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, input.page.pageSize, input.page.offset],
  );
  return { total: count.rows[0].total as number, rows: rows.rows };
}

export async function updateCertificatePdfPath(certificateId: string, pdfPath: string) {
  const result = await pool.query(
    `UPDATE certificates
     SET pdf_path = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING id::text AS id, pdf_path`,
    [pdfPath, certificateId],
  );
  return result.rows[0] ?? null;
}

export async function updateCertificateRecord(input: {
  certificateId: string;
  recipientName: string;
  issuedAt: Date | string;
  version: number;
  pdfPath: string;
}) {
  const result = await pool.query(
    `UPDATE certificates
     SET recipient_name = $1,
         issued_at = $2,
         version = $3,
         pdf_path = $4,
         status = 'active',
         updated_at = NOW()
     WHERE id = $5
     RETURNING id::text AS id, certificate_code, issued_at, status, version, pdf_path`,
    [input.recipientName, input.issuedAt, input.version, input.pdfPath, input.certificateId],
  );
  return result.rows[0] ?? null;
}

export async function insertCertificateAuditLog(input: {
  certificateId: string;
  version: number;
  certificateCode: string;
  previousName: string;
  newName: string;
  previousIssuedAt: Date | string;
  newIssuedAt: Date | string;
  reason: string;
  adminId: string;
  adminName: string;
  adminEmail: string;
  previousPdfPath: string | null;
  newPdfPath: string | null;
}) {
  const result = await pool.query(
    `INSERT INTO certificate_audit_logs (
       certificate_id, version, certificate_code,
       previous_name, new_name, previous_issued_at, new_issued_at,
       reason, admin_id, admin_name, admin_email,
       previous_pdf_path, new_pdf_path
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id::text AS id, created_at`,
    [
      input.certificateId,
      input.version,
      input.certificateCode,
      input.previousName,
      input.newName,
      input.previousIssuedAt,
      input.newIssuedAt,
      input.reason,
      input.adminId,
      input.adminName,
      input.adminEmail,
      input.previousPdfPath,
      input.newPdfPath,
    ],
  );
  return result.rows[0];
}

export async function listCertificateAuditLogs(certificateId: string) {
  const result = await pool.query(
    `SELECT
       id::text AS id,
       certificate_id::text AS certificate_id,
       version,
       certificate_code,
       previous_name,
       new_name,
       previous_issued_at,
       new_issued_at,
       reason,
       admin_id::text AS admin_id,
       admin_name,
       admin_email,
       previous_pdf_path,
       new_pdf_path,
       created_at
     FROM certificate_audit_logs
     WHERE certificate_id = $1
     ORDER BY version DESC`,
    [certificateId],
  );
  return result.rows;
}

export async function listUserAssignedCourses(userId: string): Promise<Array<{ id: string; title: string }>> {
  const result = await pool.query<{ id: string; title: string }>(
    `SELECT
       c.id::text AS id,
       c.title
     FROM users u
     JOIN courses c
       ON c.id::text = ANY(u.courseids)
     WHERE u.id = $1
     ORDER BY c.title`,
    [userId],
  );
  return result.rows;
}

export async function userLearningRecord(userId: string) {
  const enrollments = await pool.query(
    `SELECT c.title AS course_title, e.status, e.progress_percent, e.enrolled_at
     FROM enrollments e JOIN courses c ON c.id = e.course_id
     WHERE e.user_id = $1 ORDER BY e.enrolled_at DESC`,
    [userId],
  );
  const attempts = await pool.query(
    `SELECT a.id::text AS assessment_id, a.title AS assessment_title, t.id::text AS attempt_id, t.percentage, t.passed, t.submitted_at
     FROM assessment_attempts t
     JOIN assessments a ON a.id = t.assessment_id
     WHERE t.user_id = $1 AND t.submitted_at IS NOT NULL
     ORDER BY t.submitted_at DESC`,
    [userId],
  );
  const certificates = await listUserCertificates(userId);
  const assignedCourses = await listUserAssignedCourses(userId);
  return { enrollments: enrollments.rows, attempts: attempts.rows, certificates, assignedCourses };
}

export async function searchUsers(input: { q?: string; role?: string; active?: string; page: Page }) {
  const filters = ["TRUE"];
  const values: unknown[] = [];
  if (input.role === "ADMIN" || input.role === "USER") {
    values.push(input.role);
    filters.push(`role = $${values.length}`);
  }
  if (input.active === "true" || input.active === "false") {
    values.push(input.active === "true");
    filters.push(`is_active = $${values.length}`);
  }
  if (input.q) {
    values.push(`%${input.q}%`);
    filters.push(`(name ILIKE $${values.length} OR email ILIKE $${values.length} OR COALESCE(phone, '') ILIKE $${values.length})`);
  }
  const where = filters.join(" AND ");
  const count = await pool.query(`SELECT COUNT(*)::int AS total FROM users WHERE ${where}`, values);
  const rows = await pool.query(
    `SELECT id::text AS id, name, email, phone, role, is_active, is_verified, nationality, created_at
     FROM users
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, input.page.pageSize, input.page.offset],
  );
  return { total: count.rows[0].total as number, rows: rows.rows };
}

function dateClause(column: string, from: string | undefined, to: string | undefined, values: unknown[]) {
  const parts: string[] = [];
  if (from) {
    values.push(from);
    parts.push(`${column} >= $${values.length}::date`);
  }
  if (to) {
    values.push(to);
    parts.push(`${column} < ($${values.length}::date + INTERVAL '1 day')`);
  }
  return parts;
}

export async function reportSummary(from?: string, to?: string) {
  const registrationValues: unknown[] = [];
  const registrationDates = dateClause("created_at", from, to, registrationValues);
  const registrations = await pool.query(
    `SELECT COUNT(*)::int AS total FROM users
     WHERE role = 'USER' ${registrationDates.length ? `AND ${registrationDates.join(" AND ")}` : ""}`,
    registrationValues,
  );

  const enrollmentValues: unknown[] = [];
  const enrollmentDates = dateClause("enrolled_at", from, to, enrollmentValues);
  const enrollments = await pool.query(
    `SELECT COUNT(*)::int AS total FROM enrollments
     ${enrollmentDates.length ? `WHERE ${enrollmentDates.join(" AND ")}` : ""}`,
    enrollmentValues,
  );

  const completionValues: unknown[] = [];
  const completionDates = dateClause("completed_at", from, to, completionValues);
  const completions = await pool.query(
    `SELECT COUNT(*)::int AS total FROM enrollments
     WHERE status = 'completed' ${completionDates.length ? `AND ${completionDates.join(" AND ")}` : ""}`,
    completionValues,
  );

  const attemptValues: unknown[] = [];
  const attemptDates = dateClause("submitted_at", from, to, attemptValues);
  const attempts = await pool.query(
    `SELECT
       COUNT(*)::int AS submitted,
       COUNT(*) FILTER (WHERE passed)::int AS passed,
       COUNT(*) FILTER (WHERE passed = FALSE)::int AS failed
     FROM assessment_attempts
     WHERE submitted_at IS NOT NULL ${attemptDates.length ? `AND ${attemptDates.join(" AND ")}` : ""}`,
    attemptValues,
  );

  const certificateValues: unknown[] = [];
  const certificateDates = dateClause("issued_at", from, to, certificateValues);
  const certificates = await pool.query(
    `SELECT COUNT(*)::int AS total FROM certificates
     ${certificateDates.length ? `WHERE ${certificateDates.join(" AND ")}` : ""}`,
    certificateValues,
  );

  const courseValues: unknown[] = [];
  const courseDates = dateClause("e.enrolled_at", from, to, courseValues);
  const courses = await pool.query(
    `SELECT c.title,
            COUNT(e.id)::int AS enrollments,
            COUNT(e.id) FILTER (WHERE e.status = 'completed')::int AS completed
     FROM courses c
     LEFT JOIN enrollments e ON e.course_id = c.id
       ${courseDates.length ? `AND ${courseDates.join(" AND ")}` : ""}
     GROUP BY c.id
     ORDER BY enrollments DESC, c.title`,
    courseValues,
  );

  return {
    registrations: registrations.rows[0].total as number,
    enrollments: enrollments.rows[0].total as number,
    completions: completions.rows[0].total as number,
    assessments: attempts.rows[0],
    certificates: certificates.rows[0].total as number,
    courses: courses.rows,
  };
}

export async function registrationSeries(from?: string, to?: string) {
  const values: unknown[] = [];
  const dates = dateClause("created_at", from, to, values);
  const result = await pool.query(
    `SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS total
     FROM users
     WHERE role = 'USER' ${dates.length ? `AND ${dates.join(" AND ")}` : ""}
     GROUP BY created_at::date
     ORDER BY created_at::date`,
    values,
  );
  return result.rows;
}
