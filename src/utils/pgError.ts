interface PgErrorShape {
  code?: string;
  constraint?: string;
}

export function readPgError(error: unknown): PgErrorShape | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  const code = error.code;
  const constraint = "constraint" in error ? error.constraint : undefined;

  return {
    code: typeof code === "string" ? code : undefined,
    constraint: typeof constraint === "string" ? constraint : undefined,
  };
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pgError = readPgError(error);
  if (pgError?.code !== "23505") {
    return false;
  }

  if (!constraint) {
    return true;
  }

  return pgError.constraint === constraint;
}
