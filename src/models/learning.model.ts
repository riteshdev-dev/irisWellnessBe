import pool from "../config/database.js";
import type { Page } from "./catalog.model.js";

export async function findEnrollment(userId: string, courseId: string) {
  const result = await pool.query(
    `SELECT id::text AS id, user_id::text AS user_id, course_id::text AS course_id,
            status, progress_percent, enrolled_at, completed_at
     FROM enrollments
     WHERE user_id = $1 AND course_id = $2`,
    [userId, courseId],
  );
  return result.rows[0] ?? null;
}

export async function insertEnrollment(userId: string, courseId: string) {
  const result = await pool.query(
    `INSERT INTO enrollments (user_id, course_id)
     VALUES ($1, $2)
     RETURNING id::text AS id`,
    [userId, courseId],
  );
  return result.rows[0].id as string;
}

export async function completedLessonIds(enrollmentId: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT lesson_id::text AS lesson_id FROM lesson_progress WHERE enrollment_id = $1`,
    [enrollmentId],
  );
  return result.rows.map((row) => row.lesson_id as string);
}

export async function markLessonComplete(enrollmentId: string, lessonId: string) {
  await pool.query(
    `INSERT INTO lesson_progress (enrollment_id, lesson_id)
     VALUES ($1, $2)
     ON CONFLICT (enrollment_id, lesson_id) DO NOTHING`,
    [enrollmentId, lessonId],
  );
}

export async function lessonCounts(courseId: string) {
  const result = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE l.is_required)::int AS required
     FROM lessons l
     JOIN course_modules m ON m.id = l.module_id
     WHERE m.course_id = $1`,
    [courseId],
  );
  return result.rows[0] as { total: number; required: number };
}

export async function userDashboard(userId: string) {
const stats = await pool.query(
  `SELECT
     COUNT(*)::int AS enrolled,
     COUNT(*) FILTER (
       WHERE e.status = 'not_started'
     )::int AS not_started,
     COUNT(*) FILTER (
       WHERE e.status = 'in_progress'
     )::int AS in_progress,
     COUNT(*) FILTER (
       WHERE e.status = 'completed'
     )::int AS completed
   FROM enrollments e
   JOIN users u ON u.id = e.user_id
   WHERE e.user_id = $1
     AND e.course_id::text = ANY(u.courseids)`,
  [userId],
);
const certificates = await pool.query(
  `SELECT COUNT(*)::int AS total
   FROM certificates cert
   JOIN users u ON u.id = cert.user_id
   WHERE cert.user_id = $1
     AND cert.course_id::text = ANY(u.courseids)`,
  [userId],
);
const continueLearning = await pool.query(
  `SELECT
      e.course_id::text AS course_id,
      c.title,
      c.thumbnail,
      c.description,
      c.duration_minutes,
      e.status,
      e.progress_percent,
      e.updated_at
   FROM enrollments e
   JOIN courses c ON c.id = e.course_id
   JOIN users u ON u.id = e.user_id
   WHERE e.user_id = $1
     AND e.course_id::text = ANY(u.courseids)
     AND e.status <> 'completed'
   ORDER BY e.updated_at DESC
   LIMIT 4`,
  [userId],
);
const activity = await pool.query(
  `SELECT
      l.title AS lesson_title,
      c.title AS course_title,
      c.id::text AS course_id,
      lp.completed_at
   FROM lesson_progress lp
   JOIN enrollments e ON e.id = lp.enrollment_id
   JOIN lessons l ON l.id = lp.lesson_id
   JOIN course_modules m ON m.id = l.module_id
   JOIN courses c ON c.id = m.course_id
   JOIN users u ON u.id = e.user_id
   WHERE e.user_id = $1
     AND c.id::text = ANY(u.courseids)
   ORDER BY lp.completed_at DESC
   LIMIT 8`,
  [userId],
);
const recommended = await pool.query(
  `SELECT
      c.id::text AS id,
      c.title,
      c.description,
      c.thumbnail,
      c.duration_minutes,
      c.level,
      cat.name AS category_name
   FROM courses c
   JOIN course_categories cat ON cat.id = c.category_id
   JOIN users u ON u.id = $1
   WHERE c.status = 'published'
     AND c.id::text = ANY(u.courseids)
     AND NOT EXISTS (
       SELECT 1
       FROM enrollments e
       WHERE e.course_id = c.id
         AND e.user_id = $1
     )
   ORDER BY c.created_at DESC
   LIMIT 6`,
  [userId],
);
  return {
    stats: {
      ...stats.rows[0],
      certificates: certificates.rows[0].total as number,
    },
    continueLearning: continueLearning.rows,
    activity: activity.rows,
    recommended: recommended.rows,
  };
}

export async function listUserEnrollments(
  userId: string,
  status?: string,
  q?: string
) {
  const filters = [
    "e.user_id = $1",
    "e.course_id::text = ANY(u.courseids)"
  ];

  const values: unknown[] = [userId];

  if (status) {
    values.push(status);
    filters.push(`e.status = $${values.length}`);
  }

  if (q) {
    values.push(`%${q}%`);
    filters.push(`c.title ILIKE $${values.length}`);
  }

  const result = await pool.query(
    `SELECT
        e.id::text AS id,
        e.course_id::text AS course_id,
        c.title,
        c.description,
        c.thumbnail,
        c.duration_minutes,
        e.status,
        e.progress_percent,
        e.enrolled_at,
        e.completed_at,

        (
          SELECT COUNT(*)::int
          FROM lessons l
          JOIN course_modules m ON m.id = l.module_id
          WHERE m.course_id = c.id
        ) AS total_lessons,

        (
          SELECT COUNT(*)::int
          FROM lesson_progress lp
          WHERE lp.enrollment_id = e.id
        ) AS completed_lessons

     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     JOIN users u ON u.id = e.user_id

     WHERE ${filters.join(" AND ")}

     ORDER BY e.updated_at DESC`,
    values,
  );

  return result.rows;
}

export async function listAdminEnrollments(input: { q?: string; status?: string; page: Page }) {
  const filters = ["TRUE"];
  const values: unknown[] = [];
  if (input.status) {
    values.push(input.status);
    filters.push(`e.status = $${values.length}`);
  }
  if (input.q) {
    values.push(`%${input.q}%`);
    filters.push(`(u.name ILIKE $${values.length} OR u.email ILIKE $${values.length} OR c.title ILIKE $${values.length})`);
  }
  const where = filters.join(" AND ");
  const count = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN courses c ON c.id = e.course_id
     WHERE ${where}`,
    values,
  );
  const rows = await pool.query(
    `SELECT e.id::text AS id, u.id::text AS user_id, u.name AS user_name, u.email,
            c.id::text AS course_id, c.title AS course_title, e.status, e.progress_percent, e.enrolled_at
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN courses c ON c.id = e.course_id
     WHERE ${where}
     ORDER BY e.enrolled_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, input.page.pageSize, input.page.offset],
  );
  return { total: count.rows[0].total as number, rows: rows.rows };
}

export async function adminOverview() {
  const cards = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM users WHERE role = 'USER') AS therapists,
       (SELECT COUNT(*)::int FROM courses) AS courses,
       (SELECT COUNT(*)::int FROM courses WHERE status = 'published') AS published_courses,
       (SELECT COUNT(*)::int FROM enrollments) AS enrollments,
       (SELECT COUNT(DISTINCT user_id)::int FROM enrollments WHERE status = 'in_progress') AS active_learners,
       (SELECT COUNT(*)::int FROM enrollments WHERE status = 'completed') AS completed_courses,
       (SELECT COUNT(*)::int FROM assessment_attempts WHERE submitted_at IS NOT NULL) AS assessments_completed,
       (SELECT COUNT(*)::int FROM certificates) AS certificates_issued`,
  );
  const registrations = await pool.query(
    `SELECT id::text AS id, name, email, created_at
     FROM users WHERE role = 'USER'
     ORDER BY created_at DESC LIMIT 6`,
  );
  const enrollments = await pool.query(
    `SELECT u.name AS user_name, c.title AS course_title, e.enrolled_at
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN courses c ON c.id = e.course_id
     ORDER BY e.enrolled_at DESC LIMIT 6`,
  );
  const completions = await pool.query(
    `SELECT u.name AS user_name, c.title AS course_title, e.completed_at
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN courses c ON c.id = e.course_id
     WHERE e.status = 'completed'
     ORDER BY e.completed_at DESC NULLS LAST LIMIT 6`,
  );
  const coursePerformance = await pool.query(
    `SELECT c.id::text AS id, c.title,
            COUNT(e.id)::int AS enrollments,
            COUNT(e.id) FILTER (WHERE e.status = 'completed')::int AS completed
     FROM courses c
     LEFT JOIN enrollments e ON e.course_id = c.id
     GROUP BY c.id
     ORDER BY enrollments DESC, c.title
     LIMIT 8`,
  );
  const assessmentPerformance = await pool.query(
    `SELECT a.id::text AS id, a.title,
            COUNT(t.id) FILTER (WHERE t.submitted_at IS NOT NULL)::int AS submitted,
            COUNT(t.id) FILTER (WHERE t.passed)::int AS passed
     FROM assessments a
     LEFT JOIN assessment_attempts t ON t.assessment_id = a.id
     GROUP BY a.id
     ORDER BY submitted DESC, a.title
     LIMIT 8`,
  );
  return {
    cards: cards.rows[0],
    registrations: registrations.rows,
    enrollments: enrollments.rows,
    completions: completions.rows,
    coursePerformance: coursePerformance.rows,
    assessmentPerformance: assessmentPerformance.rows,
  };
}
