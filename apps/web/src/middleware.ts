import {
  AUTH_COOKIE_NAME,
  isPublicPath,
  PUBLIC_ROOT_PATHS,
} from '$/services/auth/constants'
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const redirect = NextResponse.redirect

  if (isPublicPath(pathname)) return NextResponse.next()

  // Skip checking DB if no session is found
  const hasSession = request.cookies.get(AUTH_COOKIE_NAME)
  if (!hasSession) {
    return redirect(new URL(PUBLIC_ROOT_PATHS.login, request.url))
  }

  return NextResponse.next()
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
    '/((?!api|_next/static|_next/image|favicon.ico|favicon.svg|sitemap.xml|robots.txt|placeholder.png|logodark.png|uploads).*)',
  ],
}
