// lib/server/http.ts
// Two tiny helpers so every API route reads the same way.
import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';

/** Send a JSON response. */
export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

/**
 * Read the JSON body and check it against a zod schema.
 * Returns { data } when valid, or { error } holding a ready-made 400 response.
 * Unknown fields are dropped by the schema, so callers can never sneak in
 * extra columns ("mass assignment").
 */
export async function parseBody<T>(request: Request, schema: ZodType<T>) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { error: json({ error: 'Body must be valid JSON' }, 400) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { error: json({ error: 'Invalid input', details: result.error.issues.map(i => i.path.join('.') + ': ' + i.message) }, 400) };
  }
  return { data: result.data };
}
