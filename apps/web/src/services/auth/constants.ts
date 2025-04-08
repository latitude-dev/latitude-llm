/**
 * CAUTION:
 * This file is used in nextjs middleware
 * that piece of shit is super delicate so don't import
 * here nothing that can have NodeJS apis not supported on NextJS
 * middleware runtime.
 */
export const AUTH_COOKIE_NAME = 'auth_session'

export const PUBLIC_ROOT_PATHS = {
  setup: '/setup',
  login: '/login',
  magicLinks: '/magic-links',
  invitations: '/invitations',
  share: '/share',
}

export function isPublicPath(pathname: string) {
  const publicPaths = [
    PUBLIC_ROOT_PATHS.setup,
    PUBLIC_ROOT_PATHS.login,
    PUBLIC_ROOT_PATHS.magicLinks,
    PUBLIC_ROOT_PATHS.invitations,
    PUBLIC_ROOT_PATHS.share,
  ]

  return publicPaths.some((publicPath) => pathname.startsWith(publicPath))
}
