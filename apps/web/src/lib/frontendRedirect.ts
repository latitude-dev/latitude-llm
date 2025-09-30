import {
  ActionError,
  ActionSchema,
  OnSuccessArgs,
} from '$/hooks/useLatitudeAction'

type FrontendRedirect = {
  frontendRedirect: string
}
/**
 * `next-safe-action` doesn't handle redirects on the server
 * https://github.com/TheEdoRan/next-safe-action/discussions/387
 * FUCKING HELL, shitty ecosystem
 * Where we before returned with `zsa` `redirect` imported from
 * `next/navigation` now we use a custom function callled `frontendRedirect`
 *
 * NOTE: `zsa` was another shitty abstraction on top of Next.js server actions
 * that achieve full type safety with Zod schemas.
 **/
export function frontendRedirect(route: string): FrontendRedirect {
  return { frontendRedirect: route }
}

export function isFrontendRedirect<
  ServerError,
  S extends ActionSchema,
  CVE extends ActionError<S>,
  Data,
>(
  args: OnSuccessArgs<ServerError, S, CVE, Data>,
): args is OnSuccessArgs<ServerError, S, CVE, Data & FrontendRedirect> {
  return !!args.data && typeof (args.data as any).frontendRedirect === 'string'
}
