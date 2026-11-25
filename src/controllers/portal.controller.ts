import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Request, Response } from "express";
import multer from "multer";
import QRCode from "qrcode";
import { env } from "../config/env.js";
import * as assessments from "../models/assessment.model.js";
import * as catalog from "../models/catalog.model.js";
import * as learning from "../models/learning.model.js";
import * as records from "../models/records.model.js";
import { findUserById, setUserActive, updateUserCourseIds, updateUserPhoto } from "../models/user.model.js";
import { isUniqueViolation } from "../utils/pgError.js";
import * as portal from "../services/portal.service.js";
import { deleteStoredFile, documentsDir, mediaType, readStoredFile, saveUpload } from "../services/storage.js";
import { updateProfile } from "../services/auth.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import {
  optionalDate,
  parseAnswers,
  parseAssessmentInput,
  parseCategoryInput,
  parseCourseInput,
  parseIdOrder,
  parseLessonInput,
  parseModuleInput,
  parseQuestionInput,
  requireId,
} from "../utils/portalInput.js";
import { parseProfileInput } from "../utils/validators.js";
import { toPublicUser } from "../utils/userMapper.js";

function actor(req: Request): string {
  if (!req.authUser) throw new AppError(401, "Authentication required.");
  return req.authUser.id;
}

function courseJson(row: Record<string, unknown>) {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    title: row.title,
    description: row.description,
    thumbnail: row.thumbnail,
    durationMinutes: row.duration_minutes,
    level: row.level,
    priceCents: row.price_cents,
    learningObjectives: row.learning_objectives,
    prerequisites: row.prerequisites,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function uploaded(req: Request) {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) throw new AppError(400, "Choose a file to upload.");
  return file;
}

export const mediaController = asyncHandler(async (req, res) => {
  actor(req);
  const rawParam = Array.isArray(req.params.filename)
    ? req.params.filename.join("/")
    : req.params.filename || req.params[0] || (req.url ? req.url.replace(/^\/media\/?/, "") : "");
  if (!rawParam || typeof rawParam !== "string") {
    throw new AppError(404, "File not found.");
  }
  const buffer = await readStoredFile(rawParam);
  res.setHeader("Content-Type", mediaType(rawParam));
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(buffer);
});

export const userDashboardController = asyncHandler(async (req, res) => {
  const data = await learning.userDashboard(actor(req));
  res.json({ success: true, message: "Dashboard loaded.", data });
});

export const profileController = asyncHandler(async (req, res) => {
  const user = await updateProfile(actor(req), parseProfileInput(req.body));
  res.json({ success: true, message: "Profile updated.", data: { user } });
});

export const profilePhotoController = asyncHandler(async (req, res) => {
  const userId = actor(req);
  const current = await findUserById(userId);
  const filename = await saveUpload("image", uploaded(req));
  const updated = await updateUserPhoto(userId, filename);
  if (!updated) throw new AppError(404, "Account not found.");
  await deleteStoredFile(current?.profile_photo);
  res.json({ success: true, message: "Profile photo updated.", data: { user: toPublicUser(updated) } });
});

export const catalogController = asyncHandler(async (req, res) => {
  const page = catalog.readPage(req.query);
  const result = await catalog.listCourses({
    publishedOnly: true,
    q: typeof req.query.q === "string" ? req.query.q : undefined,
    categoryId: typeof req.query.categoryId === "string" ? req.query.categoryId : undefined,
    page,
  });
  res.json({
    success: true,
    message: "Courses loaded.",
    data: { items: result.rows.map(courseJson), total: result.total, page: page.page, pageSize: page.pageSize },
  });
});

export const enrollController = asyncHandler(async (req, res) => {
  const courseId = typeof req.body?.courseId === "string" ? req.body.courseId : "";
  const enrollment = await portal.enroll(actor(req), courseId);
  res.status(201).json({ success: true, message: "You are enrolled.", data: { enrollment } });
});

export const myLearningController = asyncHandler(async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const items = await learning.listUserEnrollments(actor(req), status, q);
  res.json({ success: true, message: "Learning loaded.", data: { items } });
});

export const coursePlayerController = asyncHandler(async (req, res) => {
  const data = await portal.courseForLearner(actor(req), requireId(req.params.courseId));
  res.json({ success: true, message: "Course loaded.", data });
});

export const completeLessonController = asyncHandler(async (req, res) => {
  const data = await portal.completeLesson(actor(req), requireId(req.params.lessonId));
  res.json({ success: true, message: "Lesson marked complete.", data });
});

export const myAssessmentsController = asyncHandler(async (req, res) => {
  const items = await portal.learnerAssessments(actor(req));
  res.json({ success: true, message: "Assessments loaded.", data: { items } });
});

export const assessmentHistoryController = asyncHandler(async (req, res) => {
  const items = await assessments.listAttempts(actor(req), requireId(req.params.assessmentId));
  res.json({ success: true, message: "Results loaded.", data: { items } });
});

export const startAttemptController = asyncHandler(async (req, res) => {
  const data = await portal.startAttempt(actor(req), requireId(req.params.assessmentId));
  res.status(201).json({ success: true, message: "Assessment started.", data });
});

export const readAttemptController = asyncHandler(async (req, res) => {
  const data = await portal.readAttempt(actor(req), requireId(req.params.attemptId));
  res.json({ success: true, message: "Attempt loaded.", data });
});

export const submitAttemptController = asyncHandler(async (req, res) => {
  const data = await portal.submitAttempt(actor(req), requireId(req.params.attemptId), parseAnswers(req.body));
  res.json({ success: true, message: data.passed ? "You passed this assessment." : "Assessment submitted.", data });
});

export const myCertificatesController = asyncHandler(async (req, res) => {
  const items = await records.listUserCertificates(actor(req));
  res.json({ success: true, message: "Certificates loaded.", data: { items } });
});

export const certificatePdfController = asyncHandler(async (req, res) => {
  const certificate = await records.findCertificate(requireId(req.params.certificateId));
  if (!certificate || (req.authUser?.role !== "ADMIN" && certificate.user_id !== actor(req))) {
    throw new AppError(404, "Certificate not found.");
  }

  const versionParam = typeof req.query.version === "string" ? Number(req.query.version) : null;
  if (req.authUser?.role === "ADMIN" && versionParam && versionParam !== certificate.version) {
    const logs = await records.listCertificateAuditLogs(certificate.id);
    const matchedLog = logs.find((l: any) => Number(l.version) === versionParam);
    if (matchedLog && matchedLog.new_pdf_path) {
      const diskPath = path.resolve("public", String(matchedLog.new_pdf_path).replace(/^\/+/, ""));
      if (existsSync(diskPath)) {
        const buffer = await readFile(diskPath);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${path.basename(String(matchedLog.new_pdf_path))}"`);
        res.send(buffer);
        return;
      }
    }
    const pdf = await portal.certificatePdf({
      certificate_code: matchedLog ? matchedLog.certificate_code : certificate.certificate_code,
      therapist_name: matchedLog ? matchedLog.new_name : certificate.therapist_name,
      course_title: certificate.course_title,
      issued_at: matchedLog ? matchedLog.new_issued_at : certificate.issued_at,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${certificate.certificate_code}-v${versionParam}.pdf"`);
    res.send(pdf);
    return;
  }

  // Active / current version: ensure saved in user's documents folder
  const { buffer, filename } = await portal.ensureCertificatePdfSaved(certificate.id);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
});

export const documentAccessController = asyncHandler(async (req, res) => {
  actor(req);
  const userFolder = String(req.params.userFolder ?? "").trim();
  const filename = String(req.params.filename ?? "").trim();

  // Validate folder pattern: "user-101" or "101"
  const folderMatch = /^(?:user-)?(\d+)$/.exec(userFolder);
  if (!folderMatch) {
    throw new AppError(400, "Invalid user document folder.");
  }
  const folderUserId = folderMatch[1];

  // Authorization check: Admins can view any; regular users can ONLY view their own!
  if (req.authUser?.role !== "ADMIN" && String(req.authUser?.id) !== folderUserId) {
    throw new AppError(403, "Access denied. You can only access your own documents.");
  }

  // Validate filename: must be .pdf, alphanumeric/hyphens, no path traversal
  if (!/^[a-zA-Z0-9_\-.]+\.pdf$/i.test(filename) || filename.includes("..")) {
    throw new AppError(400, "Invalid document filename.");
  }

  // Check both user-101 and 101 directories
  let fullPath = path.join(documentsDir, `user-${folderUserId}`, filename);
  if (!existsSync(fullPath)) {
    const altPath = path.join(documentsDir, folderUserId, filename);
    if (existsSync(altPath)) {
      fullPath = altPath;
    } else {
      throw new AppError(404, "Document not found.");
    }
  }

  // Path traversal security check
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(documentsDir)) {
    throw new AppError(403, "Access denied.");
  }

  const buffer = await readFile(resolved);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.send(buffer);
});

export const verifyCertificateController = asyncHandler(async (req, res) => {
  const code = typeof req.params.code === "string" ? req.params.code : "";
  const certificate = await records.findCertificateByCode(code);
  if (!certificate) {
    res.status(404).json({ success: false, message: "This certificate could not be verified." });
    return;
  }
  res.json({
    success: true,
    message: "Certificate verified.",
    data: {
      certificateCode: certificate.certificate_code,
      therapistName: certificate.therapist_name,
      courseTitle: certificate.course_title,
      issuedAt: certificate.issued_at,
    },
  });
});

export const certificateQrController = asyncHandler(async (req, res) => {
  const code = typeof req.params.code === "string" ? req.params.code.trim() : "";
  if (!code) {
    res.status(400).json({ success: false, message: "Certificate code is required." });
    return;
  }
  const clientOrigin = env().clientOrigin || "http://localhost:5173";
  const verifyUrl = `${clientOrigin}/certificates/verify/${encodeURIComponent(code)}`;
  const buffer = await QRCode.toBuffer(verifyUrl, {
    width: 220,
    margin: 1,
    color: {
      dark: "#1e463c",
      light: "#ffffff",
    },
  });
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(buffer);
});

export const adminDashboardController = asyncHandler(async (_req, res) => {
  const data = await learning.adminOverview();
  res.json({ success: true, message: "Admin dashboard loaded.", data });
});

export const categoriesController = asyncHandler(async (_req, res) => {
  res.json({ success: true, message: "Categories loaded.", data: { items: await catalog.listCategories() } });
});

export const createCategoryController = asyncHandler(async (req, res) => {
  const input = parseCategoryInput(req.body);
  try {
    const item = await catalog.insertCategory(input.name, input.description);
    res.status(201).json({ success: true, message: "Category created.", data: { item } });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError(409, "A category with this name already exists.");
    throw error;
  }
});

export const updateCategoryController = asyncHandler(async (req, res) => {
  const input = parseCategoryInput(req.body);
  try {
    const item = await catalog.updateCategory(requireId(req.params.categoryId), input.name, input.description);
    if (!item) throw new AppError(404, "Category not found.");
    res.json({ success: true, message: "Category updated.", data: { item } });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError(409, "A category with this name already exists.");
    throw error;
  }
});

export const deleteCategoryController = asyncHandler(async (req, res) => {
  const id = requireId(req.params.categoryId);
  if ((await catalog.categoryCourseCount(id)) > 0) {
    throw new AppError(409, "Move or archive the courses in this category before deleting it.");
  }
  if (!(await catalog.deleteCategory(id))) throw new AppError(404, "Category not found.");
  res.json({ success: true, message: "Category deleted." });
});

export const adminCoursesController = asyncHandler(async (req, res) => {
  const fetchAll = req.query.all === "true" || req.query.all === "1";
  if (fetchAll) {
    const all = await catalog.listAllCoursesForSelection();
    res.json({
      success: true,
      message: "Courses loaded.",
      data: {
        items: all,
        total: all.length,
        page: 1,
        pageSize: all.length,
      },
    });
    return;
  }

  const page = catalog.readPage(req.query);

  const input = {
    q: typeof req.query.q === "string" ? req.query.q : undefined,
    status: typeof req.query.status === "string" ? req.query.status : undefined,
    categoryId: typeof req.query.categoryId === "string" ? req.query.categoryId : undefined,
    page,
  };

  const result = await catalog.listCourses(input);

  res.json({
    success: true,
    message: "Courses loaded.",
    data: {
      items: result.rows.map(courseJson),
      total: result.total,
      page: page.page,
      pageSize: page.pageSize,
    },
  });
});

export const adminCourseController = asyncHandler(async (req, res) => {
  console.log('console====',)
  const course = await catalog.findCourse(requireId(req.params.courseId));
   console.log('course====>> ',course)
  if (!course) throw new AppError(404, "Course not found.");
  const structure = await catalog.listModules(course.id);
  res.json({ success: true, message: "Course loaded.", data: { course: courseJson(course), ...structure } });
});

export const createCourseController = asyncHandler(async (req, res) => {
  const input = parseCourseInput(req.body);
  console.log('input===>>>', input)
  const id = await catalog.insertCourse({ ...input, createdBy: actor(req) });
  const course = await catalog.findCourse(id);
  res.status(201).json({ success: true, message: "Course created.", data: { course: courseJson(course) } });
});

export const updateCourseController = asyncHandler(async (req, res) => {
  const id = requireId(req.params.courseId);
  const input = parseCourseInput(req.body);
  if (!(await catalog.updateCourse(id, input))) throw new AppError(404, "Course not found.");
  const course = await catalog.findCourse(id);
  res.json({ success: true, message: "Course updated.", data: { course: courseJson(course) } });
});

export const courseThumbnailController = asyncHandler(async (req, res) => {
  const id = requireId(req.params.courseId);
  const course = await catalog.findCourse(id);
  if (!course) throw new AppError(404, "Course not found.");
  const filename = await saveUpload("image", uploaded(req));
  await catalog.setCourseThumbnail(id, filename);
  await deleteStoredFile(course.thumbnail);
  const updated = await catalog.findCourse(id);
  res.json({ success: true, message: "Thumbnail updated.", data: { course: courseJson(updated) } });
});

export const deleteCourseController = asyncHandler(async (req, res) => {
  const id = requireId(req.params.courseId);
  const course = await catalog.findCourse(id);
  if (!course) throw new AppError(404, "Course not found.");
  if ((await catalog.enrollmentCount(id)) > 0) {
    await catalog.updateCourse(id, {
      categoryId: course.category_id,
      title: course.title,
      description: course.description,
      durationMinutes: course.duration_minutes,
      level: course.level,
      priceCents: course.price_cents,
      learningObjectives: course.learning_objectives,
      prerequisites: course.prerequisites,
      status: "archived",
    });
    res.json({ success: true, message: "The course has enrollments, so it was archived instead of deleted." });
    return;
  }
  await catalog.deleteCourse(id);
  await deleteStoredFile(course.thumbnail);
  res.json({ success: true, message: "Course deleted." });
});

export const createModuleController = asyncHandler(async (req, res) => {
  console.log('rrrrrrrrrrrr')
  const courseId = requireId(req.params.courseId);
  if (!(await catalog.findCourse(courseId))) throw new AppError(404, "Course not found.");
  const input = parseModuleInput(req.body);
  const id = await catalog.insertModule(courseId, input.title, input.description, await catalog.nextModuleOrder(courseId));
  res.status(201).json({ success: true, message: "Module added.", data: { id } });
});

export const updateModuleController = asyncHandler(async (req, res) => {
  const input = parseModuleInput(req.body);
  const updated = await catalog.updateModule(requireId(req.params.moduleId), input.title, input.description);
  if (!updated) throw new AppError(404, "Module not found.");
  res.json({ success: true, message: "Module updated." });
});

export const deleteModuleController = asyncHandler(async (req, res) => {
  const removed = await catalog.deleteModule(requireId(req.params.moduleId));
  if (!removed) throw new AppError(404, "Module not found.");
  await catalog.recalculateCourseProgress(removed.course_id);
  res.json({ success: true, message: "Module deleted." });
});

export const reorderModulesController = asyncHandler(async (req, res) => {
  await portal.reorderCourseModules(requireId(req.params.courseId), parseIdOrder(req.body));
  res.json({ success: true, message: "Modules reordered." });
});

export const createLessonController = asyncHandler(async (req, res) => {
  const moduleId = requireId(req.params.moduleId);
  const courseId = await catalog.findModuleCourse(moduleId);
  if (!courseId) throw new AppError(404, "Module not found.");
  const input = parseLessonInput(req.body);
  let mediaFile: string | null = null;
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (input.kind === "video" || input.kind === "pdf") {
    if (!file) throw new AppError(400, "Upload the lesson file.");
    mediaFile = await saveUpload(input.kind, file);
  }
  const id = await catalog.insertLesson({
    moduleId,
    ...input,
    mediaFile,
    sortOrder: await catalog.nextLessonOrder(moduleId),
  });
  await catalog.recalculateCourseProgress(courseId);
  res.status(201).json({ success: true, message: "Lesson added.", data: { id } });
});

export const updateLessonController = asyncHandler(async (req, res) => {
  const id = requireId(req.params.lessonId);
  const existing = await catalog.findLesson(id);
  if (!existing) throw new AppError(404, "Lesson not found.");
  const input = parseLessonInput(req.body);
  let mediaFile = input.kind === "text" ? null : (existing.media_file as string | null);
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (file && (input.kind === "video" || input.kind === "pdf")) {
    mediaFile = await saveUpload(input.kind, file);
    if (existing.media_file && existing.media_file !== mediaFile) await deleteStoredFile(existing.media_file);
  }
  if ((input.kind === "video" || input.kind === "pdf") && !mediaFile) {
    throw new AppError(400, "Upload the lesson file.");
  }
  await catalog.updateLesson(id, { ...input, mediaFile });
  await catalog.recalculateCourseProgress(existing.course_id);
  res.json({ success: true, message: "Lesson updated." });
});

export const deleteLessonController = asyncHandler(async (req, res) => {
  const removed = await catalog.deleteLesson(requireId(req.params.lessonId));
  if (!removed) throw new AppError(404, "Lesson not found.");
  await deleteStoredFile(removed.media_file);
  await catalog.recalculateCourseProgress(removed.course_id);
  res.json({ success: true, message: "Lesson deleted." });
});

export const reorderLessonsController = asyncHandler(async (req, res) => {
  const moduleId = requireId(req.params.moduleId);
  if (!(await catalog.findModuleCourse(moduleId))) throw new AppError(404, "Module not found.");
  await portal.reorderModuleLessons(moduleId, parseIdOrder(req.body));
  res.json({ success: true, message: "Lessons reordered." });
});

export const adminAssessmentsController = asyncHandler(async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  res.json({ success: true, message: "Assessments loaded.", data: { items: await assessments.listAssessments(q) } });
});

export const adminAssessmentController = asyncHandler(async (req, res) => {
  const assessment = await assessments.findAssessment(requireId(req.params.assessmentId));
  if (!assessment) throw new AppError(404, "Assessment not found.");
  const paper = await assessments.listQuestions(assessment.id, true);
  res.json({ success: true, message: "Assessment loaded.", data: { assessment, ...paper } });
});

export const createAssessmentController = asyncHandler(async (req, res) => {
  const input = parseAssessmentInput(req.body);
  if (!input.courseId) throw new AppError(400, "Select a course.", { fields: { courseId: "Select a course." } });
  if (!(await catalog.findCourse(input.courseId))) throw new AppError(404, "Course not found.");
  try {
    const id = await assessments.insertAssessment(input);
    res.status(201).json({ success: true, message: "Assessment created.", data: { id } });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError(409, "This course already has an assessment.");
    throw error;
  }
});

export const updateAssessmentController = asyncHandler(async (req, res) => {
  const input = parseAssessmentInput(req.body);
  const updated = await assessments.updateAssessment(requireId(req.params.assessmentId), input);
  if (!updated) throw new AppError(404, "Assessment not found.");
  res.json({ success: true, message: "Assessment updated." });
});

export const deleteAssessmentController = asyncHandler(async (req, res) => {
  if (!(await assessments.deleteAssessment(requireId(req.params.assessmentId)))) {
    throw new AppError(404, "Assessment not found.");
  }
  res.json({ success: true, message: "Assessment deleted." });
});

export const createQuestionController = asyncHandler(async (req, res) => {
  const assessmentId = requireId(req.params.assessmentId);
  if (!(await assessments.findAssessment(assessmentId))) throw new AppError(404, "Assessment not found.");
  const input = parseQuestionInput(req.body);
  const id = await assessments.insertQuestion(
    assessmentId,
    input.prompt,
    input.marks,
    await assessments.nextQuestionOrder(assessmentId),
    input.options,
  );
  res.status(201).json({ success: true, message: "Question added.", data: { id } });
});

export const updateQuestionController = asyncHandler(async (req, res) => {
  const input = parseQuestionInput(req.body);
  const assessmentId = await assessments.updateQuestion(requireId(req.params.questionId), input.prompt, input.marks, input.options);
  if (!assessmentId) throw new AppError(404, "Question not found.");
  res.json({ success: true, message: "Question updated." });
});

export const deleteQuestionController = asyncHandler(async (req, res) => {
  if (!(await assessments.deleteQuestion(requireId(req.params.questionId)))) {
    throw new AppError(404, "Question not found.");
  }
  res.json({ success: true, message: "Question deleted." });
});

export const adminResultsController = asyncHandler(async (req, res) => {
  const page = catalog.readPage(req.query);
  const result = await assessments.adminAttemptResults(page, typeof req.query.q === "string" ? req.query.q : undefined);
  res.json({
    success: true,
    message: "Results loaded.",
    data: { items: result.rows, total: result.total, page: page.page, pageSize: page.pageSize },
  });
});

export const adminUsersController = asyncHandler(async (req, res) => {
  const page = catalog.readPage(req.query);
  const result = await records.searchUsers({
    q: typeof req.query.q === "string" ? req.query.q : undefined,
    role: typeof req.query.role === "string" ? req.query.role : undefined,
    active: typeof req.query.active === "string" ? req.query.active : undefined,
    page,
  });
  res.json({
    success: true,
    message: "Users loaded.",
    data: { items: result.rows, total: result.total, page: page.page, pageSize: page.pageSize },
  });
});

export const adminUserController = asyncHandler(async (req, res) => {
  const user = await findUserById(requireId(req.params.userId));
  if (!user) throw new AppError(404, "User not found.");
  const record = await records.userLearningRecord(user.id);
  res.json({ success: true, message: "User loaded.", data: { user: toPublicUser(user), ...record } });
});

export const userCoursesController = asyncHandler(async (req, res) => {
  const userId = requireId(req.params.userId);
  const user = await findUserById(userId);
  if (!user) throw new AppError(404, "User not found.");

  const assignedCourses = await records.listUserAssignedCourses(userId);
  res.json({
    success: true,
    message: "Assigned courses loaded.",
    data: {
      userId,
      courseIds: user.courseids ?? [],
      assignedCourses,
    },
  });
});

export const updateUserCoursesController = asyncHandler(async (req, res) => {
  const userId = requireId(req.params.userId);
  const user = await findUserById(userId);
  if (!user) throw new AppError(404, "User not found.");

  const body = req.body;
  if (!body || !Array.isArray(body.courseIds)) {
    throw new AppError(400, "'courseIds' must be an array of course IDs.");
  }

  const rawCourseIds: unknown[] = body.courseIds;
  const courseIds: string[] = [];

  for (const rawId of rawCourseIds) {
    if (typeof rawId !== "string" && typeof rawId !== "number") {
      throw new AppError(400, "Invalid course ID format in courseIds.");
    }
    const trimmed = String(rawId).trim();
    if (!trimmed || !/^\d+$/.test(trimmed)) {
      throw new AppError(400, `Invalid course ID: '${rawId}'. Course IDs must be numeric.`);
    }
    courseIds.push(trimmed);
  }

  // Remove duplicate IDs
  const uniqueCourseIds = Array.from(new Set(courseIds));

  // Validate that every supplied course ID exists in the courses table
  if (uniqueCourseIds.length > 0) {
    const existingCourses = await catalog.findCoursesByIds(uniqueCourseIds);
    const existingIdSet = new Set(existingCourses.map((c) => c.id));
    const missingIds = uniqueCourseIds.filter((id) => !existingIdSet.has(id));
    if (missingIds.length > 0) {
      throw new AppError(400, `The following course IDs do not exist: ${missingIds.join(", ")}`);
    }
  }

  const updated = await updateUserCourseIds(userId, uniqueCourseIds);
  if (!updated) {
    throw new AppError(404, "User not found.");
  }

  const assignedCourses = await records.listUserAssignedCourses(userId);

  res.json({
    success: true,
    message: "Assigned courses updated successfully.",
    data: {
      userId,
      courseIds: updated.courseids ?? [],
      assignedCourses,
    },
  });
});

export const userStatusController = asyncHandler(async (req, res) => {
  const id = requireId(req.params.userId);
  if (id === actor(req)) throw new AppError(400, "You cannot change your own account status.");
  const isActive = req.body?.isActive === true;
  const user = await setUserActive(id, isActive);
  if (!user) throw new AppError(404, "User not found.");
  res.json({
    success: true,
    message: isActive ? "Account activated." : "Account deactivated.",
    data: { user: toPublicUser(user) },
  });
});

export const reassignAssessmentController = asyncHandler(async (req, res) => {
  const userId = requireId(req.params.userId);
  const assessmentId = requireId(req.params.assessmentId);
  const result = await portal.reassignAssessment(userId, assessmentId);
  res.json({
    success: true,
    message: "Assessment re-created successfully. Therapist can now retake.",
    data: result,
  });
});

export const adminEnrollmentsController = asyncHandler(async (req, res) => {
  const page = catalog.readPage(req.query);
  const result = await learning.listAdminEnrollments({
    q: typeof req.query.q === "string" ? req.query.q : undefined,
    status: typeof req.query.status === "string" ? req.query.status : undefined,
    page,
  });
  res.json({
    success: true,
    message: "Enrollments loaded.",
    data: { items: result.rows, total: result.total, page: page.page, pageSize: page.pageSize },
  });
});

export const adminCertificatesController = asyncHandler(async (req, res) => {
  const page = catalog.readPage(req.query);
  const result = await records.listAdminCertificates({
    q: typeof req.query.q === "string" ? req.query.q : undefined,
    page,
  });
  res.json({
    success: true,
    message: "Certificates loaded.",
    data: { items: result.rows, total: result.total, page: page.page, pageSize: page.pageSize },
  });
});

export const regenerateCertificateController = asyncHandler(async (req, res) => {
  const certificateId = requireId(req.params.certificateId);
  const { recipientName, issuedAt, reason } = req.body ?? {};

  if (!reason || typeof reason !== "string" || !reason.trim()) {
    throw new AppError(400, "Reason for regeneration is required.");
  }

  if (recipientName !== undefined && (typeof recipientName !== "string" || !recipientName.trim())) {
    throw new AppError(400, "Recipient name cannot be empty.");
  }

  const admin = req.authUser!;
  const result = await portal.regenerateCertificate({
    certificateId,
    recipientName: typeof recipientName === "string" ? recipientName.trim() : undefined,
    issuedAt: typeof issuedAt === "string" ? issuedAt.trim() : undefined,
    reason: reason.trim(),
    adminId: admin.id,
    adminName: admin.name,
    adminEmail: admin.email,
  });

  res.json({
    success: true,
    message: "Certificate regenerated successfully.",
    data: result,
  });
});

export const certificateHistoryController = asyncHandler(async (req, res) => {
  const certificateId = requireId(req.params.certificateId);
  const certificate = await records.findCertificate(certificateId);
  if (!certificate) {
    throw new AppError(404, "Certificate not found.");
  }

  const items = await records.listCertificateAuditLogs(certificateId);
  res.json({
    success: true,
    message: "Certificate history loaded.",
    data: { items, current: certificate },
  });
});

export const reportsController = asyncHandler(async (req, res) => {
  const from = optionalDate(req.query.from);
  const to = optionalDate(req.query.to);
  const summary = await records.reportSummary(from, to);
  const registrationsByDay = await records.registrationSeries(from, to);
  res.json({ success: true, message: "Report loaded.", data: { summary, registrationsByDay } });
});

export const reportExportController = asyncHandler(async (req, res) => {
  const from = optionalDate(req.query.from);
  const to = optionalDate(req.query.to);
  const summary = await records.reportSummary(from, to);
  const lines = [
    "Metric,Value",
    `Registrations,${summary.registrations}`,
    `Enrollments,${summary.enrollments}`,
    `Course completions,${summary.completions}`,
    `Assessments submitted,${summary.assessments.submitted}`,
    `Assessments passed,${summary.assessments.passed}`,
    `Assessments failed,${summary.assessments.failed}`,
    `Certificates,${summary.certificates}`,
    "",
    "Course,Enrollments,Completed",
    ...summary.courses.map((course: { title: string; enrollments: number; completed: number }) => `"${String(course.title).replaceAll('"', '""')}",${course.enrollments},${course.completed}`),
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=portal-report.csv");
  res.send(lines.join("\n"));
});

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
});

export function uploadError(error: unknown, _req: Request, res: Response, next: (error: unknown) => void) {
  if (error instanceof multer.MulterError) {
    res.status(400).json({ success: false, message: "The file is too large or could not be uploaded." });
    return;
  }
  next(error);
}
