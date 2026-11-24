export interface ErrorDetails {
  fields?: Record<string, string>;
  retryAfterSeconds?: number;
  attemptsRemaining?: number;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly details?: ErrorDetails;

  constructor(statusCode: number, message: string, details?: ErrorDetails) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}
