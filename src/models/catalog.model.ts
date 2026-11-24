import pool from "../config/database.js";

export interface Page {
  page: number;
  pageSize: number;
  offset: number;
}

export function readPage(query: Record<string, unknown>): Page {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(20, Math.max(1, Number(query.pageSize) || 8));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export async function listCategories() {
  const result = await pool.query(
    `SELECT id::text AS id, name, description
     FROM course_categories
     ORDER BY name`,
  );
  return result.rows;
}

export async function insertCategory(name: string, description: string) {
  const result = await pool.query(
    `INSERT INTO course_categories (name, description)
     VALUES ($1, $2)
     RETURNING id::text AS id, name, description`,
    [name, description],
  );
  return result.rows[0];
}

export async function updateCategory(id: string, name: string, description: string) {
  const result = await pool.query(
    `UPDATE course_categories
     SET name = $1, description = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING id::text AS id, name, description`,
    [name, description, id],
  );
  return result.rows[0] ?? null;
}

export async function categoryCourseCount(id: string): Promise<number> {
  const result = await pool.query(`SELECT COUNT(*)::int AS total FROM courses WHERE category_id = $1`, [id]);
  return result.rows[0].total as number;
}

export async function deleteCategory(id: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM course_categories WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

const courseColumns = `
  c.id::text AS id,
  c.category_id::text AS category_id,
  cat.name AS category_name,
  c.title,
  c.description,
  c.thumbnail,
  c.duration_minutes,
  c.level,
  c.price_cents,
  c.learning_objectives,
  c.prerequisites,
  c.status,
  c.created_at,
  c.updated_at
`;

export async function listCourses(input: {
  q?: string;
  status?: string;
  categoryId?: string;
  publishedOnly?: boolean;
  page: Page;
}) {
  const filters = ["TRUE"];
  const values: unknown[] = [];
  console.log('input====>>>', input)
  if (input.publishedOnly) {
    filters.push(`c.status = 'published'`);
  }
  if (input.status) {
    values.push(input.status);
    filters.push(`c.status = $${values.length}`);
  }
  if (input.categoryId) {
    values.push(input.categoryId);
    filters.push(`c.category_id = $${values.length}`);
  }
  if (input.q) {
    values.push(`%${input.q}%`);
    filters.push(`(c.title ILIKE $${values.length} OR c.description ILIKE $${values.length})`);
  }
  const where = filters.join(" AND ");
  const count = await pool.query(`SELECT COUNT(*)::int AS total FROM courses c WHERE ${where}`, values);
  const rows = await pool.query(
    `SELECT ${courseColumns}
     FROM courses c
     JOIN course_categories cat ON cat.id = c.category_id
     WHERE ${where}
     ORDER BY c.updated_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, input.page.pageSize, input.page.offset],
  );
  return { total: count.rows[0].total as number, rows: rows.rows };
}

export async function findCourse(id: string) {
  const result = await pool.query(
    `SELECT ${courseColumns}
     FROM courses c
     JOIN course_categories cat ON cat.id = c.category_id
     WHERE c.id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function insertCourse(input: {
  categoryId: string;
  title: string;
  description: string;
  durationMinutes: number;
  level: string;
  priceCents: number | null;
  learningObjectives: string;
  prerequisites: string;
  status: string;
  createdBy: string;
}) {
  const result = await pool.query(
    `INSERT INTO courses (
       category_id, title, description, duration_minutes, level, price_cents,
       learning_objectives, prerequisites, status, created_by
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id::text AS id`,
    [
      input.categoryId,
      input.title,
      input.description,
      input.durationMinutes,
      input.level,
      input.priceCents,
      input.learningObjectives,
      input.prerequisites,
      input.status,
      input.createdBy,
    ],
  );
  return result.rows[0].id as string;
}

export async function updateCourse(
  id: string,
  input: {
    categoryId: string;
    title: string;
    description: string;
    durationMinutes: number;
    level: string;
    priceCents: number | null;
    learningObjectives: string;
    prerequisites: string;
    status: string;
  },
) {
  const result = await pool.query(
    `UPDATE courses
     SET category_id = $1, title = $2, description = $3, duration_minutes = $4, level = $5,
         price_cents = $6, learning_objectives = $7, prerequisites = $8, status = $9, updated_at = NOW()
     WHERE id = $10`,
    [
      input.categoryId,
      input.title,
      input.description,
      input.durationMinutes,
      input.level,
      input.priceCents,
      input.learningObjectives,
      input.prerequisites,
      input.status,
      id,
    ],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function setCourseThumbnail(id: string, thumbnail: string | null) {
  await pool.query(`UPDATE courses SET thumbnail = $1, updated_at = NOW() WHERE id = $2`, [thumbnail, id]);
}

export async function enrollmentCount(courseId: string): Promise<number> {
  const result = await pool.query(`SELECT COUNT(*)::int AS total FROM enrollments WHERE course_id = $1`, [courseId]);
  return result.rows[0].total as number;
}

export async function deleteCourse(id: string) {
  const result = await pool.query(`DELETE FROM courses WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function listModules(courseId: string) {
  const modules = await pool.query(
    `SELECT id::text AS id, course_id::text AS course_id, title, description, sort_order
     FROM course_modules
     WHERE course_id = $1
     ORDER BY sort_order`,
    [courseId],
  );
  const lessons = await pool.query(
    `SELECT l.id::text AS id, l.module_id::text AS module_id, l.title, l.kind, l.text_content,
            l.media_file, l.duration_minutes, l.sort_order, l.is_required
     FROM lessons l
     JOIN course_modules m ON m.id = l.module_id
     WHERE m.course_id = $1
     ORDER BY m.sort_order, l.sort_order`,
    [courseId],
  );
  return { modules: modules.rows, lessons: lessons.rows };
}

export async function nextModuleOrder(courseId: string): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(MAX(sort_order), 0)::int AS max_order FROM course_modules WHERE course_id = $1`,
    [courseId],
  );
  return (result.rows[0].max_order as number) + 1;
}

export async function insertModule(courseId: string, title: string, description: string, sortOrder: number) {
  const result = await pool.query(
    `INSERT INTO course_modules (course_id, title, description, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING id::text AS id`,
    [courseId, title, description, sortOrder],
  );
  return result.rows[0].id as string;
}

export async function updateModule(id: string, title: string, description: string) {
  const result = await pool.query(
    `UPDATE course_modules SET title = $1, description = $2, updated_at = NOW() WHERE id = $3 RETURNING course_id::text AS course_id`,
    [title, description, id],
  );
  return result.rows[0] ?? null;
}

export async function deleteModule(id: string) {
  const result = await pool.query(
    `DELETE FROM course_modules WHERE id = $1 RETURNING course_id::text AS course_id`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function moduleIds(courseId: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT id::text AS id FROM course_modules WHERE course_id = $1 ORDER BY sort_order`,
    [courseId],
  );
  return result.rows.map((row) => row.id as string);
}

export async function reorderModules(courseId: string, ids: string[]) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE course_modules SET sort_order = -sort_order - 1000 WHERE course_id = $1`, [courseId]);
    for (let index = 0; index < ids.length; index += 1) {
      await client.query(`UPDATE course_modules SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND course_id = $3`, [
        index + 1,
        ids[index],
        courseId,
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function findModuleCourse(moduleId: string): Promise<string | null> {
  const result = await pool.query(`SELECT course_id::text AS course_id FROM course_modules WHERE id = $1`, [moduleId]);
  return result.rows[0]?.course_id ?? null;
}

export async function nextLessonOrder(moduleId: string): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(MAX(sort_order), 0)::int AS max_order FROM lessons WHERE module_id = $1`,
    [moduleId],
  );
  return (result.rows[0].max_order as number) + 1;
}

export async function insertLesson(input: {
  moduleId: string;
  title: string;
  kind: string;
  textContent: string;
  mediaFile: string | null;
  durationMinutes: number;
  isRequired: boolean;
  sortOrder: number;
}) {
  const result = await pool.query(
    `INSERT INTO lessons (module_id, title, kind, text_content, media_file, duration_minutes, is_required, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id::text AS id`,
    [
      input.moduleId,
      input.title,
      input.kind,
      input.textContent,
      input.mediaFile,
      input.durationMinutes,
      input.isRequired,
      input.sortOrder,
    ],
  );
  return result.rows[0].id as string;
}

export async function findLesson(id: string) {
  const result = await pool.query(
    `SELECT l.id::text AS id, l.module_id::text AS module_id, m.course_id::text AS course_id,
            l.title, l.kind, l.text_content, l.media_file, l.duration_minutes, l.sort_order, l.is_required
     FROM lessons l
     JOIN course_modules m ON m.id = l.module_id
     WHERE l.id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function updateLesson(
  id: string,
  input: {
    title: string;
    kind: string;
    textContent: string;
    mediaFile: string | null;
    durationMinutes: number;
    isRequired: boolean;
  },
) {
  const result = await pool.query(
    `UPDATE lessons
     SET title = $1, kind = $2, text_content = $3, media_file = $4, duration_minutes = $5, is_required = $6, updated_at = NOW()
     WHERE id = $7
     RETURNING id::text AS id`,
    [input.title, input.kind, input.textContent, input.mediaFile, input.durationMinutes, input.isRequired, id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteLesson(id: string) {
  const found = await findLesson(id);
  if (!found) {
    return null;
  }
  await pool.query(`DELETE FROM lessons WHERE id = $1`, [id]);
  return found;
}

export async function lessonIds(moduleId: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT id::text AS id FROM lessons WHERE module_id = $1 ORDER BY sort_order`,
    [moduleId],
  );
  return result.rows.map((row) => row.id as string);
}

export async function reorderLessons(moduleId: string, ids: string[]) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE lessons SET sort_order = -sort_order - 1000 WHERE module_id = $1`, [moduleId]);
    for (let index = 0; index < ids.length; index += 1) {
      await client.query(`UPDATE lessons SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND module_id = $3`, [
        index + 1,
        ids[index],
        moduleId,
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function recalculateCourseProgress(courseId: string): Promise<void> {
  await pool.query(
    `WITH required AS (
       SELECT l.id
       FROM lessons l
       JOIN course_modules m ON m.id = l.module_id
       WHERE m.course_id = $1 AND l.is_required
     ),
     stats AS (
       SELECT e.id,
              (SELECT COUNT(*)::int FROM required) AS total,
              (SELECT COUNT(*)::int
               FROM lesson_progress lp
               JOIN required r ON r.id = lp.lesson_id
               WHERE lp.enrollment_id = e.id) AS done
       FROM enrollments e
       WHERE e.course_id = $1
     )
     UPDATE enrollments e
     SET progress_percent = CASE WHEN s.total = 0 THEN 0 ELSE ROUND(s.done * 100.0 / s.total)::int END,
         status = CASE
           WHEN s.total = 0 OR s.done = 0 THEN 'not_started'
           WHEN s.done >= s.total THEN 'completed'
           ELSE 'in_progress'
         END,
         completed_at = CASE
           WHEN s.total > 0 AND s.done >= s.total THEN COALESCE(e.completed_at, NOW())
           ELSE NULL
         END,
         updated_at = NOW()
     FROM stats s
     WHERE e.id = s.id`,
    [courseId],
  );
}

export async function findCoursesByIds(
  ids: string[],
): Promise<Array<{ id: string; title: string }>> {
  if (ids.length === 0) return [];
  const result = await pool.query<{ id: string; title: string }>(
    `SELECT id::text AS id, title
     FROM courses
     WHERE id::text = ANY($1::text[])`,
    [ids],
  );
  return result.rows;
}

export async function listAllCoursesForSelection(): Promise<Array<{ id: string; title: string; status: string }>> {
  const result = await pool.query<{ id: string; title: string; status: string }>(
    `SELECT id::text AS id, title, status
     FROM courses
     ORDER BY title ASC`,
  );
  return result.rows;
}

