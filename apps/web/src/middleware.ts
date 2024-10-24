import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { getSession } from '$/services/auth/getSession'
import { isBackofficePath, isPublicPath, ROUTES } from '$/services/routes'
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const redirect = NextResponse.redirect

  if (isPublicPath(pathname)) return NextResponse.next()

  const data = await getSession()
  // Skip checking DB if no session is found
  if (!data.session) return redirect(new URL(ROUTES.auth.login, request.url))

  const { user, workspace } = await getCurrentUser()

  if (!Boolean(user && workspace)) {
    return redirect(new URL(ROUTES.auth.login, request.url))
  }

  if (isBackofficePath(pathname) && !user.admin) {
    return redirect(new URL(ROUTES.root, request.url))
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
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
