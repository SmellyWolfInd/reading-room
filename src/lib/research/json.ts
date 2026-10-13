export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function str(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function strList(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => str(item)).filter(Boolean).join(", ");
  return str(value);
}

export function explainError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return "The source took too long to answer. Retry once.";
    }
    return error.message.slice(0, 400);
  }
  return "The source did not answer.";
}
