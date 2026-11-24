import { AppError } from "./AppError.js";
import { asRecord } from "./validators.js";

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < min || trimmed.length > max) return null;
  return trimmed;
}

function longText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function parseCourseInput(body: unknown) {
  const record = asRecord(body);
  const fields: Record<string, string> = {};
  const title = text(record.title, 3, 160);
  const description = typeof record.description === "string" ? record.description.trim() : "";
  const categoryId = typeof record.categoryId === "string" ? record.categoryId.trim() : "";
  const durationMinutes = Number(record.durationMinutes);
  const level = record.level;
  const objectives = longText(record.learningObjectives, 4000);
  const prerequisites = longText(record.prerequisites, 4000);
  const status = record.status;
  let priceCents: number | null = null;
  if (record.price === "" || record.price === null || record.price === undefined) {
    priceCents = null;
  } else {
    const price = Number(record.price);
    if (!Number.isFinite(price) || price < 0 || price > 1000000) {
      fields.price = "Enter a valid price, or leave it blank.";
    } else {
      priceCents = Math.round(price * 100);
    }
  }

  if (!title) fields.title = "Enter a course title.";
  if (description.length < 10) fields.description = "Enter a description of at least 10 characters.";
  if (!/^\d+$/.test(categoryId)) fields.categoryId = "Select a category.";
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 10000) {
    fields.durationMinutes = "Enter the duration in minutes.";
  }
  if (level !== "beginner" && level !== "intermediate" && level !== "advanced") {
    fields.level = "Select a course level.";
  }
  if (status !== "draft" && status !== "published" && status !== "archived") {
    fields.status = "Select a course status.";
  }
  if (Object.keys(fields).length > 0 || !title) {
    throw new AppError(400, "Please correct the highlighted fields.", { fields });
  }

  return {
    title,
    description,
    categoryId,
    durationMinutes,
    level: level as "beginner" | "intermediate" | "advanced",
    priceCents,
    learningObjectives: objectives,
    prerequisites,
    status: status as "draft" | "published" | "archived",
  };
}

export function parseCategoryInput(body: unknown) {
  const record = asRecord(body);
  const name = text(record.name, 2, 80);
  const description = longText(record.description, 500);
  if (!name) {
    throw new AppError(400, "Enter a category name.", { fields: { name: "Enter a category name." } });
  }
  return { name, description };
}

export function parseModuleInput(body: unknown) {
  const record = asRecord(body);
  const title = text(record.title, 2, 160);
  const description = longText(record.description, 2000);
  if (!title) {
    throw new AppError(400, "Enter a module title.", { fields: { title: "Enter a module title." } });
  }
  return { title, description };
}

export function parseLessonInput(body: unknown) {
  const record = asRecord(body);
  const title = text(record.title, 2, 160);
  const kind = record.kind;
  const textContent = longText(record.textContent, 20000);
  const durationMinutes = Number(record.durationMinutes);
  const isRequired = record.isRequired !== false && record.isRequired !== "false";
  const fields: Record<string, string> = {};
  if (!title) fields.title = "Enter a lesson title.";
  if (kind !== "video" && kind !== "pdf" && kind !== "text") fields.kind = "Select a lesson type.";
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 600) {
    fields.durationMinutes = "Enter the lesson duration in minutes.";
  }
  if (kind === "text" && textContent.length < 1) fields.textContent = "Enter the lesson text.";
  if (Object.keys(fields).length > 0 || !title) {
    throw new AppError(400, "Please correct the highlighted fields.", { fields });
  }
  return {
    title,
    kind: kind as "video" | "pdf" | "text",
    textContent,
    durationMinutes,
    isRequired,
  };
}

export function parseIdOrder(body: unknown): string[] {
  const record = asRecord(body);
  if (!Array.isArray(record.ids) || record.ids.some((id) => typeof id !== "string" || !/^\d+$/.test(id))) {
    throw new AppError(400, "Provide the complete ordered list of ids.");
  }
  return record.ids;
}

export function parseAssessmentInput(body: unknown) {
  const record = asRecord(body);
  const fields: Record<string, string> = {};
  const title = text(record.title, 3, 160);
  const courseId = typeof record.courseId === "string" ? record.courseId.trim() : "";
  const passingPercentage = Number(record.passingPercentage);
  const maxAttempts = Number(record.maxAttempts);
  const isActive = record.isActive !== false && record.isActive !== "false";
  let durationMinutes: number | null = null;
  if (record.durationMinutes === "" || record.durationMinutes === null || record.durationMinutes === undefined) {
    durationMinutes = null;
  } else {
    durationMinutes = Number(record.durationMinutes);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 300) {
      fields.durationMinutes = "Enter a duration in minutes, or leave it blank.";
    }
  }
  if (!title) fields.title = "Enter an assessment title.";
  if (courseId && !/^\d+$/.test(courseId)) fields.courseId = "Select a course.";
  if (!Number.isInteger(passingPercentage) || passingPercentage < 1 || passingPercentage > 100) {
    fields.passingPercentage = "Enter a passing percentage from 1 to 100.";
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    fields.maxAttempts = "Enter between 1 and 10 attempts.";
  }
  if (Object.keys(fields).length > 0 || !title) {
    throw new AppError(400, "Please correct the highlighted fields.", { fields });
  }
  return { title, courseId, passingPercentage, durationMinutes, maxAttempts, isActive };
}

export function parseQuestionInput(body: unknown) {
  const record = asRecord(body);
  const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
  const marks = Number(record.marks);
  const options = Array.isArray(record.options) ? record.options : [];
  const parsed = options.map((option) => {
    const item = option && typeof option === "object" ? (option as Record<string, unknown>) : {};
    return {
      text: typeof item.text === "string" ? item.text.trim() : "",
      correct: item.correct === true,
    };
  });
  const fields: Record<string, string> = {};
  if (prompt.length < 5) fields.prompt = "Enter the question.";
  if (!Number.isInteger(marks) || marks < 1 || marks > 100) fields.marks = "Enter the marks for this question.";
  if (parsed.length < 2 || parsed.some((option) => option.text.length < 1)) {
    fields.options = "Add at least two options.";
  }
  if (parsed.filter((option) => option.correct).length !== 1) {
    fields.correct = "Mark exactly one correct option.";
  }
  if (Object.keys(fields).length > 0) {
    throw new AppError(400, "Please correct the highlighted fields.", { fields });
  }
  return { prompt, marks, options: parsed };
}

export function parseAnswers(body: unknown) {
  const record = asRecord(body);
  if (!Array.isArray(record.answers)) {
    throw new AppError(400, "Submit an answer for every question.");
  }
  return record.answers.map((answer) => {
    const item = answer && typeof answer === "object" ? (answer as Record<string, unknown>) : {};
    const questionId = typeof item.questionId === "string" ? item.questionId : "";
    const optionId = typeof item.optionId === "string" ? item.optionId : "";
    if (!/^\d+$/.test(questionId) || !/^\d+$/.test(optionId)) {
      throw new AppError(400, "Submit an answer for every question.");
    }
    return { questionId, optionId };
  });
}

export function requireId(value: string | string[] | undefined): string {
  const id = Array.isArray(value) ? value[0] : value;
  if (!id || !/^\d+$/.test(id)) {
    throw new AppError(400, "That record could not be found.");
  }
  return id;
}

export function optionalDate(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(400, "Enter a valid date.");
  }
  return value;
}
