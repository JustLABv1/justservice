import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PUBLIC_PATHS = ["/login", "/register"]
const AUTH_COOKIE = "refresh_token"

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = request.cookies.has(AUTH_COOKIE)

  // Redirect authenticated users away from auth pages
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    if (hasSession) {
      return NextResponse.redirect(new URL("/tasks", request.url))
    }
    return NextResponse.next()
  }

  // The root path: send to tasks if session cookie present, login otherwise
  if (pathname === "/") {
    return NextResponse.redirect(
      new URL(hasSession ? "/tasks" : "/login", request.url)
    )
  }

  // All other protected routes: require session cookie
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static / _next/image (Next.js internals)
     * - favicon.ico, robots.txt, sitemap.xml (static files)
     * - /api/* (proxied to Go backend, not guarded here)
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/).*)",
  ],
}
