import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible'
import { z } from 'zod'
import {
  createMiddleware,
  createSafeActionClient,
  DEFAULT_SERVER_ERROR_MESSAGE,
} from 'next-safe-action'
import { ReplyError } from 'ioredis'
import { headers } from 'next/headers'

import { getUnsafeIp } from '$/helpers/ip'
import { captureException } from '$/helpers/captureException'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { cache } from '@latitude-data/core/cache'
import {
  LatitudeError,
  LatitudeErrorDetails,
  RateLimitError,
  UnauthorizedError,
  UnprocessableEntityError,
} from '@latitude-data/constants/errors'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  EvaluationsV2Repository,
  DatasetsRepository,
} from '@latitude-data/core/repositories'
import { findProjectById } from '@latitude-data/core/queries/projects/findById'
import { getDataFromSession } from '$/data-access'
import { flattenErrors } from '@latitude-data/core/lib/zodUtils'

const DEFAULT_RATE_LIMIT_POINTS = 1000
const DEFAULT_RATE_LIMIT_DURATION = 60

/**
 * FIXME:
 * `next-safe-action` needs an abstraction.
 * It has a type safety issue when using middlewares like `withProject`.
 *
 * At runtime it works because we validate that `projectId` is passed
 * inside `withProject` middleware, but types are not inferred correctly.
 *
 * When using in frontend a next.js action that is using a middleware like `withProject`
 * the types in their schema are not inferred correctly.
 *
 * Current workaround is to extend the `inputSchema` in the action itself.
 *
 * withProject.inputSchema(withProjectSchema.extend({ ... }))
 *
 * This is not ideal because it force the developer to remember to do this
 * If they forget, types are wrong. and code can be merged without passing `projectId`
 *
 * My proposal is to add a factory function to create these middlewares
 *
 * ```ts
 * createServerAction({
 *   scope: 'secure:withProject',
 *   schema: z.object({ projectId: z.number().or(z.string()) }),
 * }).action(...)
 *
 * This under the hood is doing the `withProject.extend({...})` automatically
 */

/**
 * Base action client with error handling.
 */
export const errorHandlingProcedure = createSafeActionClient({
  defaultValidationErrorsShape: 'flattened',
  handleServerError: async (error) => {
    try {
      const data = await getCurrentUserOrRedirect()
      captureException(error as Error, {
        component: 'serverAction',
        userId: data.user.id,
        userName: data.user.name,
        userEmail: data.user.email,
      })
    } catch {
      captureException(error as Error, { component: 'serverAction' })
    }

    if (error instanceof UnprocessableEntityError) {
      return `${error.message}: ${JSON.stringify(error.details)}`
    }

    if (error instanceof LatitudeError) {
      return error.message
    }

    return DEFAULT_SERVER_ERROR_MESSAGE
  },
})

/**
 * Auth procedure.
 */
export const authProcedure = errorHandlingProcedure.use(
  async ({ next, ctx }) => {
    const data = await getDataFromSession()

    if (!data.user || !data.workspace) {
      throw new UnauthorizedError('Unauthorized')
    }
    return next({
      ctx: {
        ...ctx,
        session: data.session,
        workspace: data.workspace,
        user: data.user,
      },
    })
  },
)

/**
 * Admin procedure.
 */
export const withAdmin = authProcedure.use(async ({ next, ctx }) => {
  if (!ctx.user?.admin) throw new UnauthorizedError('Unauthorized')

  return next({ ctx })
})

/**
 * Maybe-auth procedure.
 */
export const maybeAuthProcedure = errorHandlingProcedure.use(
  async ({ next, ctx }) => {
    const data = await getDataFromSession()
    if (!data.user || !data.workspace) {
      return next({ ctx })
    }
    return next({
      ctx: {
        ...ctx,
        session: data.session,
        workspace: data.workspace,
        user: data.user,
      },
    })
  },
)

function validateSchema<T extends z.ZodTypeAny>(schema: T, data: unknown) {
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    const errors = flattenErrors(parsed) as LatitudeErrorDetails
    throw new UnprocessableEntityError('Invalid data', errors)
  }

  return parsed.data
}

export const withProjectSchema = z.object({
  projectId: z.number().or(z.string()),
})

/**
 * With project procedure.
 */
export const withProject = authProcedure.use(
  async ({ next, ctx, clientInput }) => {
    const { projectId } = validateSchema(withProjectSchema, clientInput)
    const project = await findProjectById({ workspaceId: ctx.workspace.id, id: Number(projectId) })
      .then((r) => r.unwrap())

    return next({ ctx: { ...ctx, project } })
  },
)

export const withCommitSchema = withProjectSchema.extend({
  commitUuid: z.string(),
})

/**
 * With commit procedure.
 */
export const withCommit = withProject.use(
  async ({ next, ctx, clientInput }) => {
    const { commitUuid } = validateSchema(withCommitSchema, clientInput)
    const repository = new CommitsRepository(ctx.workspace.id)
    const commit = await repository
      .getCommitByUuid({
        projectId: ctx.project.id,
        uuid: commitUuid,
      })
      .then((r) => r.unwrap())

    return next({ ctx: { ...ctx, commit } })
  },
)

export const withDocumentSchema = withCommitSchema.extend({
  documentUuid: z.string(),
})

/**
 * With document procedure.
 */
export const withDocument = withCommit.use(
  async ({ next, ctx, clientInput }) => {
    const { documentUuid } = validateSchema(withDocumentSchema, clientInput)

    const repo = new DocumentVersionsRepository(ctx.workspace.id)
    const document = await repo
      .getDocumentAtCommit({
        projectId: ctx.project.id,
        commitUuid: ctx.commit.uuid,
        documentUuid,
      })
      .then((r) => r.unwrap())

    return next({
      ctx: { ...ctx, document, currentCommitUuid: ctx.commit.uuid },
    })
  },
)

export const withEvaluationSchema = withDocumentSchema.extend({
  evaluationUuid: z.string(),
})

/**
 * With evaluation procedure.
 */
export const withEvaluation = withDocument.use(
  async ({ next, ctx, clientInput }) => {
    const { evaluationUuid } = validateSchema(withEvaluationSchema, clientInput)
    const repository = new EvaluationsV2Repository(ctx.workspace.id)
    const evaluation = await repository
      .getAtCommitByDocument({
        projectId: ctx.project.id,
        commitUuid: ctx.commit.uuid,
        documentUuid: ctx.document.documentUuid,
        evaluationUuid,
      })
      .then((r) => r.unwrap())

    return next({ ctx: { ...ctx, evaluation } })
  },
)

export const withDatasetSchema = withDocumentSchema.extend({
  datasetId: z.number(),
})

/**
 * With dataset procedure.
 */
export const withDataset = withDocument.use(
  async ({ next, ctx, clientInput }) => {
    const { datasetId } = validateSchema(withDatasetSchema, clientInput)
    const repo = new DatasetsRepository(ctx.workspace.id)
    const dataset = await repo.find(datasetId).then((r) => r.unwrap())
    return next({ ctx: { ...ctx, dataset: dataset as Dataset } })
  },
)

type DataFromSession = Awaited<ReturnType<typeof getDataFromSession>>

type RateLimitCtx = {
  session?: DataFromSession['session']
  user?: DataFromSession['user']
  workspace?: DataFromSession['workspace']
}

/**
 * With rate limit wrapper.
 */
export function withRateLimit({
  limit = DEFAULT_RATE_LIMIT_POINTS,
  period = DEFAULT_RATE_LIMIT_DURATION,
}: {
  limit?: number
  period?: number
}) {
  return createMiddleware<{ ctx: RateLimitCtx }>().define(
    async ({ ctx, next }) => {
      const rateLimiter = new RateLimiterRedis({
        storeClient: await cache(),
        points: limit,
        duration: period,
      })

      const key = ctx.user?.id || getUnsafeIp(await headers()) || 'unknown'

      try {
        await rateLimiter.consume(key)
      } catch (error) {
        if (error instanceof RateLimiterRes) {
          throw new RateLimitError('Too many requests')
        }
        if (!(error instanceof ReplyError)) {
          throw error
        }
      }

      return next({ ctx })
    },
  )
}
