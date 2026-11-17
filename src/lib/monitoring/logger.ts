/**
 * Structured JSON logger. One line per event so Vercel / Trigger.dev log drains can
 * index fields. Event names are dot-separated: "<area>.<subject>.<outcome>".
 * Never log secrets, tokens, resume contents or other personal document text.
 */
type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      cause: error.cause === undefined ? undefined : serializeError(error.cause),
    };
  }
  return error;
}

function write(level: Level, event: string, fields: Fields = {}): void {
  const entry: Fields = { level, event, time: new Date().toISOString() };
  for (const [key, value] of Object.entries(fields)) {
    entry[key] = key === "error" ? serializeError(value) : value;
  }
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, fields?: Fields) => write("debug", event, fields),
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};
