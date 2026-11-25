import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { env } from "../config/env.js";
import * as assessments from "../models/assessment.model.js";
import * as catalog from "../models/catalog.model.js";
import * as learning from "../models/learning.model.js";
import * as records from "../models/records.model.js";
import { courseToCertificateSlug, documentsDir } from "./storage.js";
import { AppError } from "../utils/AppError.js";

function sameIdSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const known = new Set(left);
  return right.every((id) => known.has(id));
}

export async function reorderCourseModules(courseId: string, ids: string[]) {
  const current = await catalog.moduleIds(courseId);
  if (!sameIdSet(current, ids)) {
    throw new AppError(400, "The module order does not match this course.");
  }
  await catalog.reorderModules(courseId, ids);
}

export async function reorderModuleLessons(moduleId: string, ids: string[]) {
  const current = await catalog.lessonIds(moduleId);
  if (!sameIdSet(current, ids)) {
    throw new AppError(400, "The lesson order does not match this module.");
  }
  await catalog.reorderLessons(moduleId, ids);
}

export async function enroll(userId: string, courseId: string) {
  const course = await catalog.findCourse(courseId);
  if (!course || course.status !== "published") {
    throw new AppError(404, "This course is not open for enrollment.");
  }
  const existing = await learning.findEnrollment(userId, courseId);
  if (existing) {
    throw new AppError(409, "You are already enrolled in this course.");
  }
  await learning.insertEnrollment(userId, courseId);
  return learning.findEnrollment(userId, courseId);
}

export async function courseForLearner(userId: string, courseId: string) {
  const course = await catalog.findCourse(courseId);
  const enrollment = await learning.findEnrollment(userId, courseId);
  if (!course || !enrollment) {
    throw new AppError(404, "Enrolled course not found.");
  }
  const structure = await catalog.listModules(courseId);
  const completed = new Set(await learning.completedLessonIds(enrollment.id));
  const assessment = await assessments.findAssessmentByCourse(courseId);
  const passed = assessment ? await assessments.hasPassed(userId, assessment.id) : false;
  return {
    course,
    enrollment,
    modules: structure.modules,
    lessons: structure.lessons.map((lesson) => ({ ...lesson, completed: completed.has(lesson.id) })),
    assessment: assessment
      ? {
          id: assessment.id,
          title: assessment.title,
          isActive: assessment.is_active,
          unlocked: enrollment.status === "completed" && assessment.is_active,
          passed,
        }
      : null,
  };
}

export async function completeLesson(userId: string, lessonId: string) {
  const lesson = await catalog.findLesson(lessonId);
  if (!lesson) {
    throw new AppError(404, "Lesson not found.");
  }
  const enrollment = await learning.findEnrollment(userId, lesson.course_id);
  if (!enrollment) {
    throw new AppError(403, "You are not enrolled in this course.");
  }
  await learning.markLessonComplete(enrollment.id, lessonId);
  await catalog.recalculateCourseProgress(lesson.course_id);
  return courseForLearner(userId, lesson.course_id);
}

export async function learnerAssessments(userId: string) {
  const rows = await assessments.userAssessments(userId);

  return rows.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    courseId: row.course_id as string,
    courseTitle: row.course_title as string,
    passingPercentage: row.passing_percentage as number,
    durationMinutes: row.duration_minutes as number | null,
    maxAttempts: row.max_attempts as number,
    attemptsUsed: row.attempts_used as number,
    passed: Boolean(row.passed),
    bestPercentage: row.best_percentage as number | null,
    unlocked: row.enrollment_status === "completed" && row.is_active === true,
    openAttemptId: row.open_attempt_id as string | null,
    openExpiresAt: row.open_expires_at
      ? new Date(row.open_expires_at).toISOString()
      : null,
  }));
}

export async function startAttempt(userId: string, assessmentId: string) {
  const assessment = await assessments.findAssessment(assessmentId);
  if (!assessment || !assessment.is_active) {
    throw new AppError(404, "This assessment is not available.");
  }
  const enrollment = await learning.findEnrollment(userId, assessment.course_id);
  if (!enrollment || enrollment.status !== "completed") {
    throw new AppError(403, "Complete every required lesson before starting this assessment.");
  }
  if (await assessments.hasPassed(userId, assessmentId)) {
    throw new AppError(409, "You have already passed this assessment.");
  }
  const open = await assessments.findOpenAttempt(userId, assessmentId);
  if (open) {
    if (open.expires_at && new Date(open.expires_at).getTime() <= Date.now()) {
      await submitAttempt(userId, open.id, []);
    } else {
      return attemptPaper(open.id, userId);
    }
  }
  // If the user has not passed, always grant a fresh attempt so they can retake and earn certification.
  const expiresAt = assessment.duration_minutes
    ? new Date(Date.now() + assessment.duration_minutes * 60 * 1000)
    : null;
  const created = await assessments.insertAttempt({
    assessmentId,
    userId,
    enrollmentId: enrollment.id,
    expiresAt,
  });
  return attemptPaper(created.id, userId);
}

export async function reassignAssessment(userId: string, assessmentId: string) {
  const assessment = await assessments.findAssessment(assessmentId);
  if (!assessment) throw new AppError(404, "Assessment not found.");
  await assessments.resetUserAssessmentAttempts(userId, assessmentId);
  return { success: true, message: "Assessment re-created for user." };
}

async function attemptPaper(attemptId: string, userId: string) {
  const attempt = await assessments.findAttempt(attemptId);
  if (!attempt || attempt.user_id !== userId) {
    throw new AppError(404, "Assessment attempt not found.");
  }
  const paper = await assessments.listQuestions(attempt.assessment_id, false);
  return { attempt, ...paper };
}

export async function readAttempt(userId: string, attemptId: string) {
  return attemptPaper(attemptId, userId);
}

export async function submitAttempt(
  userId: string,
  attemptId: string,
  answers: Array<{ questionId: string; optionId: string }>,
) {
  const attempt = await assessments.findAttempt(attemptId);
  if (!attempt || attempt.user_id !== userId) {
    throw new AppError(404, "Assessment attempt not found.");
  }
  if (attempt.submitted_at) {
    throw new AppError(409, "This attempt has already been submitted.");
  }
  const questions = await assessments.questionIds(attempt.assessment_id);
  if (questions.length === 0) {
    throw new AppError(400, "This assessment has no questions yet.");
  }
  const expired = attempt.expires_at ? new Date(attempt.expires_at).getTime() <= Date.now() : false;
  const selected = new Map<string, string>();
  if (!expired) {
    for (const answer of answers) {
      if (!questions.includes(answer.questionId)) {
        throw new AppError(400, "One of the answers does not belong to this assessment.");
      }
      if (!(await assessments.optionBelongsToQuestion(answer.optionId, answer.questionId))) {
        throw new AppError(400, "One of the selected options is not valid.");
      }
      selected.set(answer.questionId, answer.optionId);
    }
    if (selected.size !== questions.length) {
      throw new AppError(400, "Answer every question before submitting.");
    }
  }

  const correct = await assessments.correctOptionMap(attempt.assessment_id);
  let score = 0;
  let maxScore = 0;
  for (const item of correct) {
    maxScore += item.marks;
    if (selected.get(item.question_id) === item.option_id) {
      score += item.marks;
    }
  }
  const percentage = maxScore === 0 ? 0 : Math.round((score * 100) / maxScore);
  const passed = percentage >= attempt.passing_percentage;
  const saved = await assessments.saveSubmission(
    attemptId,
    [...selected.entries()].map(([questionId, optionId]) => ({ questionId, optionId })),
    { score, maxScore, percentage, passed },
  );
  if (!saved) {
    throw new AppError(409, "This attempt has already been submitted.");
  }
  if (passed) {
    const cert = await records.insertCertificate({
      enrollmentId: attempt.enrollment_id,
      userId,
      courseId: attempt.course_id,
      code: records.newCertificateCode(),
    });
    if (cert?.id) {
      try {
        await ensureCertificatePdfSaved(cert.id);
      } catch (err) {
        console.error("Failed to pre-save certificate PDF:", err);
      }
    }
  }
  const finished = await assessments.findAttempt(attemptId);
  return {
    score,
    maxScore,
    percentage,
    passed,
    passingPercentage: attempt.passing_percentage,
    submittedAt: finished?.submitted_at ?? new Date(),
    expired,
  };
}

export async function certificatePdf(certificate: {
  certificate_code: string;
  therapist_name: string;
  course_title: string;
  issued_at: Date | string;
}): Promise<Buffer> {
  const issued = new Date(certificate.issued_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const verifyUrl = `${env().clientOrigin}/certificates/verify/${certificate.certificate_code}`;
  const qr = await QRCode.toBuffer(verifyUrl, { width: 180, margin: 1 });

  return await new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 56 });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    document.rect(28, 28, 539, 786).lineWidth(1.5).strokeColor("#1e463c").stroke();
    document.rect(38, 38, 519, 766).lineWidth(0.4).strokeColor("#9c7b52").stroke();
    document.fillColor("#1e463c").font("Times-Bold").fontSize(28).text("Iris Wellness", 56, 92, {
      align: "center",
    });
    document.fillColor("#9c7b52").font("Times-Roman").fontSize(13).text("Certificate of Completion", {
      align: "center",
    });
    document.moveDown(2);
    document.fillColor("#1b2421").font("Times-Roman").fontSize(14).text("This certifies that", { align: "center" });
    document.moveDown(0.6);
    document.font("Times-Bold").fontSize(26).text(certificate.therapist_name, { align: "center" });
    document.moveDown(0.7);
    document.font("Times-Roman").fontSize(14).text("has successfully completed", { align: "center" });
    document.moveDown(0.5);
    document.font("Times-Bold").fontSize(20).text(certificate.course_title, { align: "center" });
    document.moveDown(1.4);
    document.font("Times-Roman").fontSize(12).text(`Issued on ${issued}`, { align: "center" });
    document.text(`Certificate ID ${certificate.certificate_code}`, { align: "center" });
    document.image(qr, 228, 470, { width: 140 });
    document.fontSize(11).text("Scan to verify this certificate", 56, 624, { align: "center" });
    document.moveTo(120, 690).lineTo(250, 690).strokeColor("#1e463c").stroke();
    document.fontSize(11).text("Authorized signature", 120, 698, { width: 130, align: "center" });
    document.end();
  });
}

export async function ensureCertificatePdfSaved(certificateId: string): Promise<{
  buffer: Buffer;
  filename: string;
  relativePath: string;
  diskPath: string;
}> {
  const certificate = await records.findCertificate(certificateId);
  if (!certificate) {
    throw new AppError(404, "Certificate not found.");
  }

  const userId = String(certificate.user_id);
  const userFolder = `user-${userId}`;
  const userDir = path.join(documentsDir, userFolder);
  await mkdir(userDir, { recursive: true });

  const slug = courseToCertificateSlug(certificate.course_title);
  const version = Number(certificate.version) || 1;
  const filename = version > 1 ? `certificate-${slug}-v${version}.pdf` : `certificate-${slug}.pdf`;
  const diskPath = path.join(userDir, filename);
  const relativePath = `/documents/${userFolder}/${filename}`;

  let buffer: Buffer;
  if (existsSync(diskPath)) {
    buffer = await readFile(diskPath);
  } else {
    buffer = await certificatePdf(certificate);
    await writeFile(diskPath, buffer);
  }

  if (certificate.pdf_path !== relativePath) {
    await records.updateCertificatePdfPath(certificate.id, relativePath);
  }

  return { buffer, filename, relativePath, diskPath };
}

export async function regenerateCertificate(input: {
  certificateId: string;
  recipientName?: string;
  issuedAt?: string;
  reason: string;
  adminId: string;
  adminName: string;
  adminEmail: string;
}) {
  const current = await records.findCertificate(input.certificateId);
  if (!current) {
    throw new AppError(404, "Certificate not found.");
  }

  const userId = String(current.user_id);
  const userFolder = `user-${userId}`;
  const userDir = path.join(documentsDir, userFolder);
  await mkdir(userDir, { recursive: true });

  const slug = courseToCertificateSlug(current.course_title);
  const newVersion = (Number(current.version) || 1) + 1;
  const previousName = current.therapist_name;
  const newName = (input.recipientName?.trim()) || previousName;
  const previousIssuedAt = current.issued_at;
  const newIssuedAt = input.issuedAt ? new Date(input.issuedAt) : new Date(previousIssuedAt);

  if (isNaN(newIssuedAt.getTime())) {
    throw new AppError(400, "Invalid issue date.");
  }

  // 1. Ensure previous PDF is safely preserved inside this user's folder
  const prevVersion = Number(current.version) || 1;
  const prevFilename = prevVersion > 1 ? `certificate-${slug}-v${prevVersion}.pdf` : `certificate-${slug}.pdf`;
  const prevDiskPath = path.join(userDir, prevFilename);
  const prevPdfRelativePath = `/documents/${userFolder}/${prevFilename}`;

  if (!existsSync(prevDiskPath)) {
    const prevPdfBuffer = await certificatePdf({
      certificate_code: current.certificate_code,
      therapist_name: previousName,
      course_title: current.course_title,
      issued_at: previousIssuedAt,
    });
    await writeFile(prevDiskPath, prevPdfBuffer);
  }

  // 2. Generate and save new PDF inside this user's folder
  const newFilename = `certificate-${slug}-v${newVersion}.pdf`;
  const newDiskPath = path.join(userDir, newFilename);
  const newPdfRelativePath = `/documents/${userFolder}/${newFilename}`;

  const newPdfBuffer = await certificatePdf({
    certificate_code: current.certificate_code,
    therapist_name: newName,
    course_title: current.course_title,
    issued_at: newIssuedAt,
  });
  await writeFile(newDiskPath, newPdfBuffer);

  // 3. Write audit log
  await records.insertCertificateAuditLog({
    certificateId: current.id,
    version: newVersion,
    certificateCode: current.certificate_code,
    previousName,
    newName,
    previousIssuedAt,
    newIssuedAt,
    reason: input.reason.trim(),
    adminId: input.adminId,
    adminName: input.adminName,
    adminEmail: input.adminEmail,
    previousPdfPath: prevPdfRelativePath,
    newPdfPath: newPdfRelativePath,
  });

  // 4. Update certificate record
  const updated = await records.updateCertificateRecord({
    certificateId: current.id,
    recipientName: newName,
    issuedAt: newIssuedAt,
    version: newVersion,
    pdfPath: newPdfRelativePath,
  });

  return {
    certificate: {
      ...current,
      ...updated,
      therapist_name: newName,
      pdf_path: newPdfRelativePath,
    },
    audit: {
      version: newVersion,
      reason: input.reason.trim(),
      adminName: input.adminName,
      regeneratedAt: new Date(),
    },
  };
}
