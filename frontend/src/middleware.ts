import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { RETURN_URL_PARAM, isSafeReturnUrl } from "@/lib/routeGuard";

const MAINTENANCE = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true";

/** Routes that require an admin session cookie / JWT claim. */
const ADMIN_ONLY_PATHS = ["/docs/colors"];

/**
 * Routes that require any authenticated session (wallet connected + JWT).
 * Issue #1208: redirect unauthenticated users to `/` from these paths.
 * Issue #1500: preserve the original destination in a `returnUrl` query param
 * so the app can redirect the user back after they authenticate.
 */
const PROTECTED_PATHS = [
  "/dashboard",
  "/loans",
  "/collateral",
  "/transactions",
  "/profile",
  "/settings",
  "/borrow",
];

/**
 * Decode the `session` JWT cookie payload without verifying the signature.
 * The signature is verified inside the API layer; the middleware only gates
 * the UI, so reading the claim is sufficient here.
 */
function readSessionPayload(session: string | undefined): Record<string, unknown> | null {
  if (!session) return null;
  try {
    const parts = session.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(atob(parts[1])) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Check whether the request carries a valid (non-expired) session JWT cookie.
 * Issue #1500: the route guard rejects both missing and expired tokens.
 */
function isAuthenticated(request: NextRequest): boolean {
  const payload = readSessionPayload(request.cookies.get("session")?.value);
  if (!payload) return false;
  const exp = payload.exp;
  if (typeof exp !== "number") return false;
  // Token expiry is a Unix timestamp in seconds (JWT standard).
  return exp * 1000 > Date.now();
}

/** Lightweight role check: reads the `role` claim from the `session` cookie. */
function isAdminRequest(request: NextRequest): boolean {
  return readSessionPayload(request.cookies.get("session")?.value)?.role === "admin";
}

/** Build the home URL with a safe `returnUrl` capturing the original request. */
function redirectHomeWithReturnUrl(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const home = new URL("/", request.url);
  const target = pathname + (search || "");
  // Only echo back internal paths; drop anything that looks like an open redirect.
  if (isSafeReturnUrl(target)) {
    home.searchParams.set(RETURN_URL_PARAM, target);
  }
  return NextResponse.redirect(home);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow the maintenance page itself and static assets through
  if (
    MAINTENANCE &&
    pathname !== "/maintenance" &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/favicon")
  ) {
    return NextResponse.redirect(new URL("/maintenance", request.url));
  }

  // Issue #1208 / #1500: redirect unauthenticated users away from protected
  // routes, recording where they were headed via `returnUrl`.
  if (PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (!isAuthenticated(request)) {
      return redirectHomeWithReturnUrl(request);
    }
  }

  // Restrict admin-only pages (#784)
  if (ADMIN_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (!isAdminRequest(request)) {
      return redirectHomeWithReturnUrl(request);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
