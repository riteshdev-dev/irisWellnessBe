import { AppError } from "./AppError.js";
import { normalizeCountry, normalizeInternationalPhone } from "./phone.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_PATTERN = /^[\p{L}][\p{L}\s.'-]{1,99}$/u;

export function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError(400, "Invalid request body.");
  }

  return body as Record<string, unknown>;
}

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (email.length > 255 || !EMAIL_PATTERN.test(email)) {
    return null;
  }

  return email;
}

export function normalizePhone(value: string): string | null {
  const digits = value.trim().replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    return null;
  }

  return digits;
}

export function normalizeName(value: string): string | null {
  const name = value.trim().replace(/\s+/g, " ");
  if (!NAME_PATTERN.test(name)) {
    return null;
  }

  return name;
}

export function validatePassword(password: string): string | null {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number.";
  }
  return null;
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  confirmPassword?: string;
  nationality: string | null;
  country: string | null;
  phoneCountryIso2: string;
  phoneCountryCode: string;
  phoneNumber: string;
  phone: string;
}

export function parseSignupInput(body: unknown): SignupInput {
  const record = asRecord(body);
  const fields: Record<string, string> = {};

  const name = typeof record.name === "string" ? normalizeName(record.name) : null;
  const email = typeof record.email === "string" ? normalizeEmail(record.email) : null;
  const password = typeof record.password === "string" ? record.password : "";
  const confirmPassword = typeof record.confirmPassword === "string" ? record.confirmPassword : "";
  const nationality = typeof record.nationality === "string" ? normalizeCountry(record.nationality) : null;
  const country = typeof record.country === "string" ? normalizeCountry(record.country) : nationality;

  const phone = normalizeInternationalPhone(
    typeof record.phoneCountryIso2 === "string" ? record.phoneCountryIso2 : "",
    typeof record.phoneNumber === "string" ? record.phoneNumber : "",
  );

  if (!name) {
    fields.name = "Enter your full name using letters, spaces, apostrophes, or hyphens.";
  }

  if (!email) {
    fields.email = "Enter a valid email address.";
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    fields.password = passwordError;
  }

  if (confirmPassword && password !== confirmPassword) {
    fields.confirmPassword = "Passwords do not match.";
  } else if (!confirmPassword) {
    fields.confirmPassword = "Confirm your password.";
  }

  if (!phone) {
    fields.phoneNumber = "Enter a valid mobile number for the selected country.";
  }

  if (Object.keys(fields).length > 0 || !name || !email || !phone) {
    throw new AppError(400, "Please correct the highlighted fields.", { fields });
  }

  return {
    name,
    email,
    password,
    confirmPassword,
    nationality,
    country,
    phoneCountryIso2: phone.country,
    phoneCountryCode: phone.countryCallingCode,
    phoneNumber: phone.nationalNumber,
    phone: phone.digits,
  };
}

export interface LoginInput {
  email: string;
  password: string;
}

export function parseLoginInput(body: unknown): LoginInput {
  const record = asRecord(body);
  const fields: Record<string, string> = {};

  const rawEmail = typeof record.email === "string" ? record.email : "";
  const email = normalizeEmail(rawEmail);
  const password = typeof record.password === "string" ? record.password : "";

  if (!email) {
    fields.email = "Enter a valid email address.";
  }

  if (!password) {
    fields.password = "Enter your password.";
  }

  if (Object.keys(fields).length > 0 || !email || !password) {
    throw new AppError(400, "Please correct the highlighted fields.", { fields });
  }

  return { email, password };
}

export interface ResetPasswordInput {
  challengeToken: string;
  otp: string;
  password: string;
  confirmPassword: string;
}

export function parseResetPasswordInput(body: unknown): ResetPasswordInput {
  const record = asRecord(body);
  const fields: Record<string, string> = {};

  const challengeToken = typeof record.challengeToken === "string" ? record.challengeToken.trim() : "";
  const otp = typeof record.otp === "string" ? record.otp.replace(/\D/g, "") : "";
  const password = typeof record.password === "string" ? record.password : "";
  const confirmPassword = typeof record.confirmPassword === "string" ? record.confirmPassword : "";

  if (!challengeToken) {
    throw new AppError(400, "Verification session token is missing.");
  }

  if (!/^\d{6}$/.test(otp)) {
    fields.otp = "Enter a valid 6-digit verification code.";
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    fields.password = passwordError;
  }

  if (password !== confirmPassword) {
    fields.confirmPassword = "Passwords do not match.";
  }

  if (Object.keys(fields).length > 0) {
    throw new AppError(400, "Please correct the highlighted fields.", { fields });
  }

  return { challengeToken, otp, password, confirmPassword };
}

export interface ProfileInput {
  name: string;
  phoneCountryIso2: string;
  phoneCountryCode: string;
  phoneNumber: string;
  phone: string;
  country: string | null;
  city: string | null;
  state: string | null;
  courseIds?: string[];
  dateOfBirth: string | null;
  professionalDetails: string | null;
}

export function parseProfileInput(body: unknown): ProfileInput {
  const record = asRecord(body);
  const fields: Record<string, string> = {};

  const name = typeof record.name === "string" ? normalizeName(record.name) : null;
  const countryRaw = typeof record.country === "string" ? record.country.trim() : "";
  const country = countryRaw ? normalizeCountry(countryRaw) : null;
  const city = typeof record.city === "string" ? record.city.trim() : "";
  const state = typeof record.state === "string" ? record.state.trim() : "";
  const birthRaw = typeof record.dateOfBirth === "string" ? record.dateOfBirth.trim() : "";
  const professionalDetails =
    typeof record.professionalDetails === "string" ? record.professionalDetails.trim() : "";

  let courseIds: string[] | undefined = undefined;
  if ("courseIds" in record) {
    if (Array.isArray(record.courseIds)) {
      courseIds = record.courseIds.map((item) => String(item).trim()).filter(Boolean);
    } else {
      fields.courseIds = "Course IDs must be an array.";
    }
  }

  const phone = normalizeInternationalPhone(
    typeof record.phoneCountryIso2 === "string" ? record.phoneCountryIso2 : "",
    typeof record.phoneNumber === "string" ? record.phoneNumber : "",
  );

  if (!name) {
    fields.name = "Enter your full name using letters, spaces, apostrophes, or hyphens.";
  }

  if (!phone) {
    fields.phoneNumber = "Enter a valid mobile number for the selected country.";
  }

  if (countryRaw && !country) {
    fields.country = "Select a valid country.";
  }

  if (state.length > 100) {
    fields.state = "State must be 100 characters or fewer.";
  }

  if (city.length > 100) {
    fields.city = "City must be 100 characters or fewer.";
  }

  if (professionalDetails.length > 2000) {
    fields.professionalDetails = "Professional details must be 2000 characters or fewer.";
  }

  let dateOfBirth: string | null = null;
  if (birthRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthRaw)) {
      fields.dateOfBirth = "Enter a valid date of birth.";
    } else {
      const birth = new Date(`${birthRaw}T00:00:00.000Z`);
      const today = new Date();
      const oldest = new Date("1920-01-01T00:00:00.000Z");

      if (Number.isNaN(birth.getTime()) || birth.toISOString().slice(0, 10) !== birthRaw || birth > today || birth < oldest) {
        fields.dateOfBirth = "Enter a valid date of birth.";
      } else {
        dateOfBirth = birthRaw;
      }
    }
  }

  if (Object.keys(fields).length > 0 || !name || !country || !phone || !city) {
    throw new AppError(400, "Please correct the highlighted fields.", { fields });
  }

  return {
    name,
    phoneCountryIso2: phone.country,
    phoneCountryCode: phone.countryCallingCode,
    phoneNumber: phone.nationalNumber,
    phone: phone.digits,
    country,
    state,
    courseIds,
    city,
    dateOfBirth,
    professionalDetails: professionalDetails || null,
  };
}

export interface IdentifierInput {
  identifier: string;
  email: string | null;
  phone: string | null;
}

export function parseIdentifierInput(body: unknown): IdentifierInput {
  const record = asRecord(body);
  const raw = typeof record.identifier === "string" ? record.identifier.trim() : typeof record.email === "string" ? record.email.trim() : "";

  if (!raw) {
    throw new AppError(400, "Please correct the highlighted fields.", {
      fields: { identifier: "Enter your email address." },
    });
  }

  if (raw.includes("@")) {
    const email = normalizeEmail(raw);
    if (!email) {
      throw new AppError(400, "Please correct the highlighted fields.", {
        fields: { identifier: "Enter a valid email address." },
      });
    }

    return { identifier: email, email, phone: null };
  }

  const phone = normalizePhone(raw);
  if (!phone) {
    throw new AppError(400, "Please correct the highlighted fields.", {
      fields: { identifier: "Enter a valid email address or mobile number." },
    });
  }

  return { identifier: phone, email: null, phone };
}

export function parseAuthPurpose(body: unknown): "login" | "signup" | "reset_password" {
  const record = asRecord(body);
  if (record.purpose === "signup") return "signup";
  if (record.purpose === "reset_password") return "reset_password";
  return "login";
}

export function parseOtpCode(body: unknown): string {
  const record = asRecord(body);
  const raw = typeof record.otp === "string" ? record.otp.replace(/\D/g, "") : "";

  if (!/^\d{6}$/.test(raw)) {
    throw new AppError(400, "Enter the 6-digit verification code.", {
      fields: { otp: "The code must be 6 digits." },
    });
  }

  return raw;
}
