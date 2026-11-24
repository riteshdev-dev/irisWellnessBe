import "dotenv/config";

export type OtpProvider = "console" | "email" | "sms" | "both";

const OTP_PROVIDERS: readonly OtpProvider[] = ["console", "email", "sms", "both"];

export interface AppEnv {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  clientOrigin: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  otpProvider: OtpProvider;
  otpExpiresMinutes: number;
  otpMaxAttempts: number;
  otpResendCooldownSeconds: number;
  bcryptRounds: number;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
  };
  twilio: {
    accountSid: string;
    authToken: string;
    fromNumber: string;
  };
}

function readNumber(name: string, fallback: number, max = 10_000): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > max) {
    throw new Error(`${name} must be a positive integer up to ${max}`);
  }

  return value;
}

function readProvider(): OtpProvider {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const raw = process.env.OTP_PROVIDER ?? (nodeEnv === "production" ? "" : "console");

  if (!OTP_PROVIDERS.includes(raw as OtpProvider)) {
    throw new Error("OTP_PROVIDER must be one of: console, email, sms, both");
  }

  return raw as OtpProvider;
}

export function loadEnv(): AppEnv {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const jwtSecret = process.env.JWT_SECRET ?? "";

  if (jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be set to a random string of at least 32 characters");
  }

  return {
    nodeEnv,
    isProduction: nodeEnv === "production",
    port: readNumber("PORT", 5000, 65535),
    clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "12h",
    otpProvider: readProvider(),
    otpExpiresMinutes: readNumber("OTP_EXPIRES_MINUTES", 5, 60),
    otpMaxAttempts: readNumber("OTP_MAX_ATTEMPTS", 5, 10),
    otpResendCooldownSeconds: readNumber("OTP_RESEND_COOLDOWN_SECONDS", 60, 3600),
    bcryptRounds: readNumber("BCRYPT_ROUNDS", 10, 15),
    smtp: {
      host: process.env.SMTP_HOST ?? "",
      port: readNumber("SMTP_PORT", 587, 65535),
      secure: process.env.SMTP_SECURE === "true",
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
      from: process.env.SMTP_FROM ?? "",
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
      authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
      fromNumber: process.env.TWILIO_FROM_NUMBER ?? "",
    },
  };
}

let cached: AppEnv | undefined;

export function env(): AppEnv {
  cached ??= loadEnv();
  return cached;
}

export function assertEnv(): void {
  const config = env();

  if (config.isProduction && config.otpProvider === "console") {
    throw new Error("OTP_PROVIDER=console cannot be used when NODE_ENV=production");
  }
}
