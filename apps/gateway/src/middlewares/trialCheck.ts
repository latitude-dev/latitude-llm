import { Context, Next } from 'hono'
import { checkPayingOrTrial } from '@latitude-data/core/lib/checkPayingOrTrial'
import { OpenAPIHono } from '@hono/zod-openapi'

declare module 'hono' {
  interface ContextVariableMap {
    skipTrialCheck?: boolean
  }
}

const SKIP_TRIAL_CHECK_PATHS = new Set<string>()

/**
 * Resets the skip paths. Only used for testing.
 * @internal
 */
export function resetTrialCheckSkips() {
  SKIP_TRIAL_CHECK_PATHS.clear()
}

/**
 * Registers paths to skip trial check. Call this from route files.
 *
 * @example In a route file
 * ```ts
 * import { skipTrialCheckFor } from '$/middlewares/trialCheck'
 * import { runRoute } from './run'
 *
 * skipTrialCheckFor([runRoute.path])
 *
 * export const documentsRouter = createRouter()
 *   .openapi(runRoute, runHandler)
 * ```
 */
export function skipTrialCheckFor(paths: string[]) {
  for (const path of paths) {
    SKIP_TRIAL_CHECK_PATHS.add(path)
  }
}

const skipTrialCheck = () => async (c: Context, next: Next) => {
  c.set('skipTrialCheck', true)
  await next()
}

/**
 * Creates the trial check middleware and applies all registered skip paths.
 * Must be called after authMiddleware.
 *
 * @example
 * ```ts
 * app.use(authMiddleware())
 * app.use(createTrialCheckMiddleware(app))
 * ```
 */
export function createTrialCheckMiddleware(app: OpenAPIHono) {
  for (const path of SKIP_TRIAL_CHECK_PATHS) {
    app.use(path, skipTrialCheck())
  }

  return async (c: Context, next: Next) => {
    if (c.get('skipTrialCheck')) return next()

    checkPayingOrTrial({
      subscription: c.get('workspace').currentSubscription,
    }).unwrap()

    await next()
  }
}
