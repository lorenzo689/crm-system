import { NextResponse, type NextRequest } from "next/server";

/**
 * Content Security Policy with a fresh nonce per request (Next.js 16 proxy).
 *
 * Scripts: only Next's own, nonce-tagged scripts and what they load
 * ('strict-dynamic'). No external script hosts, no inline scripts without the
 * nonce. Pages are rendered dynamically (see app/layout.tsx) so Next can put
 * the nonce on its hydration scripts.
 *
 * Styles keep 'unsafe-inline': React's `style` props and Next's injected
 * styles are not nonce-able; style injection is far less dangerous than
 * script injection, and every other directive stays strict.
 */
const isDev = process.env.NODE_ENV === "development";

/** Absolute API origin when the API runs on another origin (local dev only). */
function apiOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
  try {
    return new URL(configured).origin;
  } catch {
    return ""; // relative URL: same origin, covered by 'self'
  }
}

export function buildContentSecurityPolicy(nonce: string) {
  const api = apiOrigin();
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${api}`.trim(),
    "font-src 'self' data:",
    `connect-src 'self' ${api}${isDev ? " ws: wss:" : ""}`.trim(),
    `frame-src 'self' blob: ${api}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!isDev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = buildContentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|images/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
