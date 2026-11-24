export type UserRole = "ADMIN" | "USER";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  nationality: string | null;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
  phoneCountryIso2: string | null;
  country: string | null;
  city: string | null;
  state: string | null;
  courseIds: string[] | null;
  dateOfBirth: string | null;
  professionalDetails: string | null;
  profilePhoto: string | null;
  isActive: boolean;
  role: UserRole;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OtpChallenge {
  challengeToken: string;
  maskedDestination: string;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string | null;
  phone: string | null;
  nationality: string | null;
  phone_country_code: string | null;
  phone_number: string | null;
  phone_country_iso2: string | null;
  country: string | null;
  state: string | null;
  courseids: string[] | null;
  city: string | null;
  date_of_birth: Date | string | null;
  professional_details: string | null;
  profile_photo: string | null;
  is_active: boolean;
  role: string;
  is_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface OtpRow {
  id: string;
  user_id: string;
  otp_hash: string;
  purpose: string;
  expires_at: Date;
  attempts: number;
  verified_at: Date | null;
  created_at: Date;
}
