import { appendFileSync } from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { env, type OtpProvider } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { maskEmail, maskPhone } from "../utils/mask.js";

export interface OtpRecipient {
  name: string;
  email: string;
  phone: string | null;
}

function messageBody(code: string, minutes: number): string {
  return `Your Spa Therapist Portal verification code is ${code}. It expires in ${minutes} minutes. Do not share this code.`;
}

function assertEmailConfig(): void {
  const { smtp } = env();
  if (!smtp.host || !smtp.from) {
    throw new AppError(500, "Email delivery is not configured on the server.");
  }
}

function assertSmsConfig(): void {
  const { twilio } = env();
  if (!twilio.accountSid || !twilio.authToken || !twilio.fromNumber) {
    throw new AppError(500, "SMS delivery is not configured on the server.");
  }
}

async function sendEmail(recipient: OtpRecipient, code: string): Promise<void> {
  assertEmailConfig();
  const { smtp, otpExpiresMinutes } = env();
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });

  await transport.sendMail({
    from: smtp.from,
    to: recipient.email,
    subject: "Your Spa Therapist Portal verification code",
    text: `Hello ${recipient.name},\n\n${messageBody(code, otpExpiresMinutes)}\n`,
  });
}

async function sendSms(recipient: OtpRecipient, code: string): Promise<void> {
  assertSmsConfig();
  if (!recipient.phone) {
    throw new AppError(500, "This account has no mobile number for SMS delivery.");
  }

  const { twilio, otpExpiresMinutes } = env();
  const body = new URLSearchParams({
    To: recipient.phone.startsWith("+") ? recipient.phone : `+${recipient.phone}`,
    From: twilio.fromNumber,
    Body: messageBody(code, otpExpiresMinutes),
  });

  const authorization = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  if (!response.ok) {
    console.error("SMS provider rejected the OTP message.");
    throw new AppError(502, "The verification code could not be sent. Please try again.");
  }
}

function deliverConsole(recipient: OtpRecipient, code: string): void {
  const config = env();
  if (config.isProduction) {
    throw new AppError(500, "OTP delivery is not configured on the server.");
  }

  const phone = recipient.phone ? maskPhone(recipient.phone) : "none";
  console.log(`[OTP:dev-only] destination email=${maskEmail(recipient.email)} phone=${phone}`);
  console.log(`[OTP:dev-only] code=${code}`);
  appendFileSync(
    path.resolve(".otp-dev.log"),
    `${new Date().toISOString()} ${recipient.email} ${code}\n`,
    "utf8",
  );
}

export function maskedDestinationFor(recipient: OtpRecipient, provider: OtpProvider): string {
  const email = maskEmail(recipient.email);
  const phone = recipient.phone ? maskPhone(recipient.phone) : null;

  if (provider === "email") {
    return email;
  }

  if (provider === "sms") {
    return phone ?? email;
  }

  return phone ? `${email} and ${phone}` : email;
}

export async function deliverOtp(recipient: OtpRecipient, code: string): Promise<string> {
  const provider = env().otpProvider;
  const maskedDestination = maskedDestinationFor(recipient, provider);

  if (provider === "console") {
    deliverConsole(recipient, code);
    return maskedDestination;
  }

  if (provider === "email" || provider === "both") {
    try {
      await sendEmail(recipient, code);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      console.error("Email provider failed to send the OTP.");
      throw new AppError(502, "The verification code could not be sent. Please try again.");
    }
  }

  if (provider === "sms" || provider === "both") {
    try {
      await sendSms(recipient, code);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      console.error("SMS provider failed to send the OTP.");
      throw new AppError(502, "The verification code could not be sent. Please try again.");
    }
  }

  return maskedDestination;
}
