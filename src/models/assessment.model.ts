import pool from "../config/database.js";
import type { Page } from "./catalog.model.js";

export async function listAssessments(q?: string) {
  const values: unknown[] = [];
  const filter = q ? `WHERE a.title ILIKE $1 OR c.title ILIKE $1` : "";
  if (q) {
    values.push(`%${q}%`);
  }
  const result = await pool.query(
    `SELECT a.id::text AS id, a.course_id::text AS course_id, c.title AS course_title, a.title,
            a.passing_percentage, a.duration_minutes, a.max_attempts, a.is_active,
            (SELECT COUNT(*)::int FROM assessment_questions q WHERE q.assessment_id = a.id) AS question_count,
            (SELECT COALESCE(SUM(marks), 0)::int FROM assessment_questions q WHERE q.assessment_id = a.id) AS total_marks
     FROM assessments a
     JOIN courses c ON c.id = a.course_id
     ${filter}
     ORDER BY a.updated_at DESC`,
    values,
  );
  return result.rows;
}

export async function findAssessment(id: string) {
  const result = await pool.query(
    `SELECT a.id::text AS id, a.course_id::text AS course_id, c.title AS course_title, a.title,
            a.passing_percentage, a.duration_minutes, a.max_attempts, a.is_active
     FROM assessments a
     JOIN courses c ON c.id = a.course_id
     WHERE a.id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function findAssessmentByCourse(courseId: string) {
  const result = await pool.query(
    `SELECT id::text AS id, course_id::text AS course_id, title, passing_percentage, duration_minutes, max_attempts, is_active
     FROM assessments WHERE course_id = $1`,
    [courseId],
  );
  return result.rows[0] ?? null;
}

export async function insertAssessment(input: {
  courseId: string;
  title: string;
  passingPercentage: number;
  durationMinutes: number | null;
  maxAttempts: number;
  isActive: boolean;
}) {
  const result = await pool.query(
    `INSERT INTO assessments (course_id, title, passing_percentage, duration_minutes, max_attempts, is_active)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id::text AS id`,
    [input.courseId, input.title, input.passingPercentage, input.durationMinutes, input.maxAttempts, input.isActive],
  );
  return result.rows[0].id as string;
}

export async function updateAssessment(
  id: string,
  input: {
    title: string;
    passingPercentage: number;
    durationMinutes: number | null;
    maxAttempts: number;
    isActive: boolean;
  },
) {
  const result = await pool.query(
    `UPDATE assessments
     SET title = $1, passing_percentage = $2, duration_minutes = $3, max_attempts = $4, is_active = $5, updated_at = NOW()
     WHERE id = $6`,
    [input.title, input.passingPercentage, input.durationMinutes, input.maxAttempts, input.isActive, id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteAssessment(id: string) {
  const result = await pool.query(`DELETE FROM assessments WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function listQuestions(assessmentId: string, includeCorrect: boolean) {
  const questions = await pool.query(
    `SELECT id::text AS id, prompt, marks, sort_order
     FROM assessment_questions
     WHERE assessment_id = $1
     ORDER BY sort_order`,
    [assessmentId],
  );
  const options = await pool.query(
    `SELECT o.id::text AS id, o.question_id::text AS question_id, o.option_text, o.sort_order
            ${includeCorrect ? ", o.is_correct" : ""}
     FROM assessment_options o
     JOIN assessment_questions q ON q.id = o.question_id
     WHERE q.assessment_id = $1
     ORDER BY o.sort_order`,
    [assessmentId],
  );
  return { questions: questions.rows, options: options.rows };
}

export async function nextQuestionOrder(assessmentId: string): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(MAX(sort_order), 0)::int AS max_order FROM assessment_questions WHERE assessment_id = $1`,
    [assessmentId],
  );
  return (result.rows[0].max_order as number) + 1;
}

export async function insertQuestion(
  assessmentId: string,
  prompt: string,
  marks: number,
  sortOrder: number,
  options: Array<{ text: string; correct: boolean }>,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const question = await client.query(
      `INSERT INTO assessment_questions (assessment_id, prompt, marks, sort_order)
       VALUES ($1,$2,$3,$4)
       RETURNING id::text AS id`,
      [assessmentId, prompt, marks, sortOrder],
    );
    const questionId = question.rows[0].id as string;
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      if (!option) continue;
      await client.query(
        `INSERT INTO assessment_options (question_id, option_text, is_correct, sort_order)
         VALUES ($1,$2,$3,$4)`,
        [questionId, option.text, option.correct, index + 1],
      );
    }
    await client.query("COMMIT");
    return questionId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateQuestion(
  questionId: string,
  prompt: string,
  marks: number,
  options: Array<{ text: string; correct: boolean }>,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE assessment_questions SET prompt = $1, marks = $2 WHERE id = $3 RETURNING assessment_id::text AS assessment_id`,
      [prompt, marks, questionId],
    );
    if (!updated.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(`DELETE FROM assessment_options WHERE question_id = $1`, [questionId]);
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      if (!option) continue;
      await client.query(
        `INSERT INTO assessment_options (question_id, option_text, is_correct, sort_order)
         VALUES ($1,$2,$3,$4)`,
        [questionId, option.text, option.correct, index + 1],
      );
    }
    await client.query("COMMIT");
    return updated.rows[0].assessment_id as string;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteQuestion(questionId: string) {
  const result = await pool.query(
    `DELETE FROM assessment_questions WHERE id = $1 RETURNING assessment_id::text AS assessment_id`,
    [questionId],
  );
  return result.rows[0] ?? null;
}

export async function userAssessments(userId: string) {
  const result = await pool.query(
    `SELECT a.id::text AS id, a.title, a.course_id::text AS course_id, c.title AS course_title,
            a.passing_percentage, a.duration_minutes, a.max_attempts, a.is_active,
            e.status AS enrollment_status,
            (SELECT COUNT(*)::int FROM assessment_attempts t
             WHERE t.assessment_id = a.id AND t.user_id = $1 AND t.submitted_at IS NOT NULL) AS attempts_used,
            (SELECT t.passed FROM assessment_attempts t
             WHERE t.assessment_id = a.id AND t.user_id = $1 AND t.passed = TRUE
             LIMIT 1) AS passed,
            (SELECT MAX(t.percentage) FROM assessment_attempts t
             WHERE t.assessment_id = a.id AND t.user_id = $1 AND t.submitted_at IS NOT NULL) AS best_percentage,
            (SELECT t.id::text FROM assessment_attempts t
             WHERE t.assessment_id = a.id AND t.user_id = $1 AND t.submitted_at IS NULL
             ORDER BY t.started_at DESC LIMIT 1) AS open_attempt_id,
            (SELECT t.expires_at FROM assessment_attempts t
             WHERE t.assessment_id = a.id AND t.user_id = $1 AND t.submitted_at IS NULL
             ORDER BY t.started_at DESC LIMIT 1) AS open_expires_at
    FROM assessments a
JOIN courses c ON c.id = a.course_id
JOIN enrollments e ON e.course_id = a.course_id AND e.user_id = $1
JOIN users u ON u.id = e.user_id
WHERE a.course_id::text = ANY(u.courseids)
ORDER BY c.title`,
    [userId],
  );
  return result.rows;
}

export async function listAttempts(userId: string, assessmentId: string) {
  const result = await pool.query(
    `SELECT id::text AS id, started_at, submitted_at, score, max_score, percentage, passed
     FROM assessment_attempts
     WHERE user_id = $1 AND assessment_id = $2 AND submitted_at IS NOT NULL
     ORDER BY submitted_at DESC`,
    [userId, assessmentId],
  );
  return result.rows;
}

export async function findOpenAttempt(userId: string, assessmentId: string) {
  const result = await pool.query(
    `SELECT id::text AS id, enrollment_id::text AS enrollment_id, started_at, expires_at, submitted_at
     FROM assessment_attempts
     WHERE user_id = $1 AND assessment_id = $2 AND submitted_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1`,
    [userId, assessmentId],
  );
  return result.rows[0] ?? null;
}

export async function submittedAttemptCount(userId: string, assessmentId: string): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM assessment_attempts
     WHERE user_id = $1 AND assessment_id = $2 AND submitted_at IS NOT NULL`,
    [userId, assessmentId],
  );
  return result.rows[0].total as number;
}

export async function hasPassed(userId: string, assessmentId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM assessment_attempts
     WHERE user_id = $1 AND assessment_id = $2 AND passed = TRUE
     LIMIT 1`,
    [userId, assessmentId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function insertAttempt(input: {
  assessmentId: string;
  userId: string;
  enrollmentId: string;
  expiresAt: Date | null;
}) {
  const result = await pool.query(
    `INSERT INTO assessment_attempts (assessment_id, user_id, enrollment_id, expires_at)
     VALUES ($1,$2,$3,$4)
     RETURNING id::text AS id, started_at, expires_at`,
    [input.assessmentId, input.userId, input.enrollmentId, input.expiresAt],
  );
  return result.rows[0];
}

export async function findAttempt(id: string) {
  const result = await pool.query(
    `SELECT t.id::text AS id, t.assessment_id::text AS assessment_id, t.user_id::text AS user_id,
            t.enrollment_id::text AS enrollment_id, t.started_at, t.expires_at, t.submitted_at,
            t.score, t.max_score, t.percentage, t.passed,
            a.passing_percentage, a.title, c.title AS course_title, c.id::text AS course_id
     FROM assessment_attempts t
     JOIN assessments a ON a.id = t.assessment_id
     JOIN courses c ON c.id = a.course_id
     WHERE t.id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function correctOptionMap(assessmentId: string) {
  const result = await pool.query(
    `SELECT q.id::text AS question_id, q.marks, o.id::text AS option_id
     FROM assessment_questions q
     JOIN assessment_options o ON o.question_id = q.id AND o.is_correct = TRUE
     WHERE q.assessment_id = $1`,
    [assessmentId],
  );
  return result.rows as Array<{ question_id: string; marks: number; option_id: string }>;
}

export async function questionIds(assessmentId: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT id::text AS id FROM assessment_questions WHERE assessment_id = $1 ORDER BY sort_order`,
    [assessmentId],
  );
  return result.rows.map((row) => row.id as string);
}

export async function optionBelongsToQuestion(optionId: string, questionId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM assessment_options WHERE id = $1 AND question_id = $2`,
    [optionId, questionId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function saveSubmission(
  attemptId: string,
  answers: Array<{ questionId: string; optionId: string }>,
  result: { score: number; maxScore: number; percentage: number; passed: boolean },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const answer of answers) {
      await client.query(
        `INSERT INTO attempt_answers (attempt_id, question_id, option_id)
         VALUES ($1,$2,$3)
         ON CONFLICT (attempt_id, question_id) DO UPDATE SET option_id = EXCLUDED.option_id`,
        [attemptId, answer.questionId, answer.optionId],
      );
    }
    const updated = await client.query(
      `UPDATE assessment_attempts
       SET submitted_at = NOW(), score = $1, max_score = $2, percentage = $3, passed = $4
       WHERE id = $5 AND submitted_at IS NULL
       RETURNING id::text AS id`,
      [result.score, result.maxScore, result.percentage, result.passed, attemptId],
    );
    await client.query("COMMIT");
    return Boolean(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function adminAttemptResults(page: Page, q?: string) {
  const values: unknown[] = [];
  const filter = q
    ? `WHERE t.submitted_at IS NOT NULL AND (u.name ILIKE $1 OR u.email ILIKE $1 OR a.title ILIKE $1)`
    : `WHERE t.submitted_at IS NOT NULL`;
  if (q) values.push(`%${q}%`);
  const count = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM assessment_attempts t
     JOIN users u ON u.id = t.user_id
     JOIN assessments a ON a.id = t.assessment_id
     ${filter}`,
    values,
  );
  const rows = await pool.query(
    `SELECT t.id::text AS id, t.user_id::text AS user_id, t.assessment_id::text AS assessment_id,
            u.name AS user_name, u.email, a.title AS assessment_title,
            c.title AS course_title, t.percentage, t.passed, t.submitted_at
     FROM assessment_attempts t
     JOIN users u ON u.id = t.user_id
     JOIN assessments a ON a.id = t.assessment_id
     JOIN courses c ON c.id = a.course_id
     ${filter}
     ORDER BY t.submitted_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, page.pageSize, page.offset],
  );
  return { total: count.rows[0].total as number, rows: rows.rows };
}

export async function resetUserAssessmentAttempts(userId: string, assessmentId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM assessment_attempts WHERE user_id = $1 AND assessment_id = $2`,
    [userId, assessmentId],
  );
  return (result.rowCount ?? 0) > 0;
}
