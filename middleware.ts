// middleware.ts  (root of project — same level as app/)
// ============================================================
// THE LIFE-RPG PROTOCOL — Route Protection Middleware
//
// Rules:
//   /dashboard (and all sub-routes) → requires auth → redirect /login
//   /login                          → if already authed → redirect /dashboard
//   Everything else                 → pass through
//
// Uses @supabase/ssr createServerClient so the session cookie is
// read correctly in the Edge runtime without touching the browser client.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient }             from '@supabase/ssr';

// Routes that require authentication
const PROTECTED_PREFIXES = ['/dashboard'];

// Routes that logged-in users should be bounced away from
const AUTH_ONLY_ROUTES = ['/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Build a response we can mutate (for cookie refresh) ────
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // ── Create a server-side Supabase client ───────────────────
  // This client reads/writes session cookies on the request/response.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          // Write updated cookies both to the request and response
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // ── Refresh session (rotates tokens if needed) ─────────────
  // IMPORTANT: always call getUser() — never getSession() — to validate
  // the JWT server-side rather than trusting the cookie alone.
  const { data: { user } } = await supabase.auth.getUser();

  const isAuthed        = !!user;
  const isProtected     = PROTECTED_PREFIXES.some(p => pathname.startsWith(p));
  const isAuthOnlyRoute = AUTH_ONLY_ROUTES.some(p => pathname.startsWith(p));

  // ── Guard: unauthenticated user hits protected route ───────
  if (isProtected && !isAuthed) {
    const loginUrl = new URL('/login', request.url);
    // Preserve the originally requested path so we can redirect back after login
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Guard: authenticated user hits /login ──────────────────
  if (isAuthOnlyRoute && isAuthed) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

// ── Matcher: run middleware only on relevant paths ─────────────
// Excludes static files, images, and Next.js internals.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
