import { NextResponse } from "next/server";

export type ApiError = { error: string; code?: string; details?: unknown };

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { status: 200, ...init });
}

export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, code: "BAD_REQUEST", details } satisfies ApiError, {
    status: 400,
  });
}

export function unauthorized(message = "Please sign in to continue.") {
  return NextResponse.json({ error: message, code: "UNAUTHORIZED" } satisfies ApiError, {
    status: 401,
  });
}

export function forbidden(message = "You do not have access to this resource.") {
  return NextResponse.json({ error: message, code: "FORBIDDEN" } satisfies ApiError, {
    status: 403,
  });
}

export function notFound(message = "Not found.") {
  return NextResponse.json({ error: message, code: "NOT_FOUND" } satisfies ApiError, {
    status: 404,
  });
}

export function conflict(message: string, code = "CONFLICT") {
  return NextResponse.json({ error: message, code } satisfies ApiError, { status: 409 });
}

export function serverError(message = "Something went wrong on our side. Please try again.") {
  return NextResponse.json({ error: message, code: "SERVER_ERROR" } satisfies ApiError, {
    status: 500,
  });
}

export function unavailable(message: string, code = "UNAVAILABLE", details?: unknown) {
  return NextResponse.json({ error: message, code, details } satisfies ApiError, {
    status: 503,
  });
}

export function tooManyRequests(message = "Too many attempts. Please wait a minute and try again.") {
  return NextResponse.json({ error: message, code: "RATE_LIMITED" } satisfies ApiError, {
    status: 429,
  });
}

export async function readBody<T = unknown>(request: Request): Promise<T | null> {
  try {
    const text = await request.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
