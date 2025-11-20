import {
  AUTH_COOKIE_NAME,
  isPublicPath,
  PUBLIC_ROOT_PATHS,
} from '$/services/auth/constants'
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  // Set current url in headers so downstream components can
  // use it (yes, this is the only way to do it, Next is...)
  const currentUrl = request.nextUrl.pathname + request.nextUrl.search
  const headers = new Headers(request.headers)
  headers.set('x-current-url', currentUrl)

  const pathname = request.nextUrl.pathname
  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers } })
  }

  // Skip checking DB if no session is found
  const hasSession = request.cookies.get(AUTH_COOKIE_NAME)
  if (!hasSession) {
    const loginUrl = new URL(PUBLIC_ROOT_PATHS.login, request.url)
    return NextResponse.redirect(
      `${loginUrl}?returnTo=${encodeURIComponent(currentUrl)}`,
    )
  }

  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - placeholder.png (placeholder image)
     * - uploads (public uploads folder)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|favicon.svg|sitemap.xml|robots.txt|placeholder.png|latitude-logo.png|uploads).*)',
  ],
}
