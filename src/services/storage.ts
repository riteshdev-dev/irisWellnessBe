import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../utils/AppError.js";

const publicDir: string = path.resolve("public");
export const coursePdfDir: string = path.join(publicDir, "course");
export const videoDir: string = path.join(publicDir, "video");
export const documentsDir: string = path.join(publicDir, "documents");
export const uploadsDir: string = path.resolve("uploads");

export function courseToCertificateSlug(courseTitle: string): string {
  const normalized = (courseTitle || "").normalize("NFKD").toLowerCase();
  let slug = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) {
    slug = "course";
  }
  if (slug.length > 60) {
    slug = slug.slice(0, 60).replace(/-+$/, "");
  }
  return slug;
}

const maxPdfBytes = Number(process.env.MAX_PDF_SIZE_BYTES) || 15 * 1024 * 1024; // 15MB
const maxVideoBytes = Number(process.env.MAX_VIDEO_SIZE_BYTES) || 80 * 1024 * 1024; // 80MB
const maxImageBytes = Number(process.env.MAX_IMAGE_SIZE_BYTES) || 2 * 1024 * 1024; // 2MB

const kinds = {
  image: {
    extensions: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
    allowedExtensions: [".jpg", ".jpeg", ".png", ".webp"],
    maxBytes: maxImageBytes,
    maxMb: Math.round(maxImageBytes / (1024 * 1024)),
  },
  pdf: {
    extensions: { "application/pdf": "pdf" },
    allowedExtensions: [".pdf"],
    maxBytes: maxPdfBytes,
    maxMb: Math.round(maxPdfBytes / (1024 * 1024)),
  },
  video: {
    extensions: { "video/mp4": "mp4", "video/webm": "webm" },
    allowedExtensions: [".mp4", ".webm"],
    maxBytes: maxVideoBytes,
    maxMb: Math.round(maxVideoBytes / (1024 * 1024)),
  },
} as const;

export type StoredKind = keyof typeof kinds;

export function validateFileContent(kind: StoredKind, buffer: Buffer): void {
  if (buffer.length < 4) {
    throw new AppError(400, "The uploaded file is empty or corrupted.");
  }

  if (kind === "pdf") {
    const header = buffer.subarray(0, 5).toString("ascii");
    if (!header.startsWith("%PDF")) {
      throw new AppError(400, "Invalid file content. The uploaded file is not a valid PDF document.");
    }
  } else if (kind === "video") {
    const isWebM = buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
    const isMp4 = buffer.length >= 8 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
    if (!isWebM && !isMp4) {
      throw new AppError(400, "Invalid file content. Only valid MP4 and WebM videos are supported.");
    }
  } else if (kind === "image") {
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    const isJpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isWebp =
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP";
    if (!isPng && !isJpg && !isWebp) {
      throw new AppError(400, "Invalid file content. Only valid PNG, JPEG, and WebP images are supported.");
    }
  }
}

export function sanitizeBaseFilename(originalname: string | undefined, defaultBase: string): string {
  let base = defaultBase;
  if (originalname && typeof originalname === "string") {
    const parsed = path.parse(originalname);
    if (parsed.name) {
      base = parsed.name;
    }
  }

  // Normalize Unicode
  let sanitized = base.normalize("NFKD");
  // Remove any path separators / backslashes / null bytes
  sanitized = sanitized.replace(/[\/\\]/g, "");
  // Replace spaces and special characters with hyphen
  sanitized = sanitized.replace(/[^\w.-]+/g, "-");
  // Collapse multiple hyphens
  sanitized = sanitized.replace(/-+/g, "-");
  // Remove leading and trailing hyphens/dots
  sanitized = sanitized.replace(/^[.-]+|[.-]+$/g, "");

  if (!sanitized) {
    sanitized = defaultBase;
  }

  // Truncate to maximum 80 characters so filename + counter + ext easily fits in VARCHAR(160)
  if (sanitized.length > 80) {
    sanitized = sanitized.slice(0, 80).replace(/[.-]+$/, "");
  }

  return sanitized;
}

export async function getUniqueFilename(dir: string, baseName: string, ext: string): Promise<string> {
  const extension = ext.startsWith(".") ? ext : `.${ext}`;
  let candidate = `${baseName}${extension}`;
  let fullPath = path.join(dir, candidate);

  let counter = 1;
  while (true) {
    try {
      await access(fullPath);
      // File exists, append incremental counter
      candidate = `${baseName}-${counter}${extension}`;
      fullPath = path.join(dir, candidate);
      counter++;
    } catch {
      // File does not exist, safe to use
      break;
    }
  }

  return candidate;
}

export async function saveUpload(
  kind: StoredKind,
  file: { buffer: Buffer; mimetype: string; size: number; originalname?: string },
): Promise<string> {
  const allowed = kinds[kind];
  const extension = allowed.extensions[file.mimetype as keyof typeof allowed.extensions];
  if (!extension) {
    throw new AppError(400, `This file type is not allowed for ${kind}. Allowed extensions: ${allowed.allowedExtensions.join(", ")}`);
  }

  if (file.originalname) {
    const origExt = path.extname(file.originalname).toLowerCase();
    if (origExt && !(allowed.allowedExtensions as readonly string[]).includes(origExt)) {
      throw new AppError(400, `Invalid file extension. Expected: ${allowed.allowedExtensions.join(", ")}`);
    }
  }

  if (file.size > allowed.maxBytes) {
    throw new AppError(400, `The file is too large. Maximum size for ${kind} is ${allowed.maxMb}MB.`);
  }

  // Validate actual content signatures
  validateFileContent(kind, file.buffer);

  if (kind === "pdf") {
    await mkdir(coursePdfDir, { recursive: true });
    const baseName = sanitizeBaseFilename(file.originalname, "course-document");
    const uniqueFilename = await getUniqueFilename(coursePdfDir, baseName, "pdf");
    const fullPath = path.join(coursePdfDir, uniqueFilename);
    await writeFile(fullPath, file.buffer);
    return `/course/${uniqueFilename}`;
  }

  if (kind === "video") {
    await mkdir(videoDir, { recursive: true });
    const baseName = sanitizeBaseFilename(file.originalname, "course-video");
    const uniqueFilename = await getUniqueFilename(videoDir, baseName, extension);
    const fullPath = path.join(videoDir, uniqueFilename);
    await writeFile(fullPath, file.buffer);
    return `/video/${uniqueFilename}`;
  }

  // Image uploads (profile photos, thumbnails)
  await mkdir(uploadsDir, { recursive: true });
  const filename = `${kind}-${randomBytes(16).toString("hex")}.${extension}`;
  await writeFile(path.join(uploadsDir, filename), file.buffer);
  return filename;
}

export function resolveStoredFile(inputPath: string): string {
  if (!inputPath || typeof inputPath !== "string") {
    throw new AppError(404, "File not found.");
  }

  let decoded = inputPath;
  try {
    decoded = decodeURIComponent(inputPath);
  } catch {
    // Malformed URI, keep as is
  }

  const normalized = decoded.replace(/\\/g, "/").trim();
  if (normalized.includes("..") || normalized.includes("\0")) {
    throw new AppError(400, "Invalid file path.");
  }

  const clean = normalized.replace(/^\/+/, "");

  if (clean.startsWith("course/")) {
    const relative = clean.slice("course/".length);
    const target = path.resolve(coursePdfDir, relative);
    if (!target.startsWith(coursePdfDir)) {
      throw new AppError(403, "Access denied.");
    }
    return target;
  }

  if (clean.startsWith("video/")) {
    const relative = clean.slice("video/".length);
    const target = path.resolve(videoDir, relative);
    if (!target.startsWith(videoDir)) {
      throw new AppError(403, "Access denied.");
    }
    return target;
  }

  if (clean.startsWith("documents/")) {
    const relative = clean.slice("documents/".length);
    const target = path.resolve(documentsDir, relative);
    if (!target.startsWith(documentsDir)) {
      throw new AppError(403, "Access denied.");
    }
    return target;
  }

  // Legacy or image file: check uploadsDir first
  const targetUploads = path.resolve(uploadsDir, clean);
  if (targetUploads.startsWith(uploadsDir) && existsSync(targetUploads)) {
    return targetUploads;
  }

  // Check if file exists directly in public/course (without course/ prefix)
  const targetCourse = path.resolve(coursePdfDir, clean);
  if (targetCourse.startsWith(coursePdfDir) && existsSync(targetCourse)) {
    return targetCourse;
  }

  // Check if file exists directly in public/video (without video/ prefix)
  const targetVideo = path.resolve(videoDir, clean);
  if (targetVideo.startsWith(videoDir) && existsSync(targetVideo)) {
    return targetVideo;
  }

  // Check if file exists in public/uploads
  const targetPublicUploads = path.resolve(publicDir, "uploads", clean);
  if (targetPublicUploads.startsWith(publicDir) && existsSync(targetPublicUploads)) {
    return targetPublicUploads;
  }

  return targetUploads;
}

export async function readStoredFile(filename: string): Promise<Buffer> {
  try {
    const filePath = resolveStoredFile(filename);
    return await readFile(filePath);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(404, "File not found.");
  }
}

export async function deleteStoredFile(filename: string | null | undefined): Promise<void> {
  if (!filename || typeof filename !== "string") {
    return;
  }

  try {
    const filePath = resolveStoredFile(filename);
    await rm(filePath, { force: true });
  } catch {
    // Quietly ignore if already removed or missing
  }
}

export function mediaType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}
