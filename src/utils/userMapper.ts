import type { PublicUser, UserRole, UserRow } from "../types/auth.js";
import { AppError } from "./AppError.js";

export function assertRole(role: string): UserRole {
  if (role === "ADMIN" || role === "USER") {
    return role;
  }

  throw new AppError(500, "Something went wrong. Please try again.");
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    nationality: row.nationality,
    phoneCountryCode: row.phone_country_code,
    phoneNumber: row.phone_number,
    phoneCountryIso2: row.phone_country_iso2,
    country: row.country,
    state: row.state,
    courseIds:row.courseids,
    city: row.city,
    dateOfBirth: row.date_of_birth
      ? new Date(row.date_of_birth).toISOString().slice(0, 10)
      : null,
    professionalDetails: row.professional_details,
    profilePhoto: row.profile_photo,
    isActive: row.is_active,
    role: assertRole(row.role),
    isVerified: row.is_verified,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
