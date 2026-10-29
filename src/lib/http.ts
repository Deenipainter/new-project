export class HttpTimeoutError extends Error {
  constructor(message = "The request timed out.") {
    super(message);
    this.name = "HttpTimeoutError";
  }
}

export class HttpError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

/**
 * fetch with a hard timeout and no automatic retries.
 * Retrying a money-moving request automatically is unsafe; callers must
 * reconcile by reference instead.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 15000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal, cache: "no-store" });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpTimeoutError(`Request to ${new URL(url).host} timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function readJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

/** Strips anything that looks like a secret before it reaches a log or the UI. */
export function redact(value: string, secrets: Array<string | undefined | null>): string {
  let out = value;
  for (const secret of secrets) {
    if (secret && secret.length > 4) {
      out = out.split(secret).join("***redacted***");
    }
  }
  return out;
}
