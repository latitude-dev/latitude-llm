import * as Sentry from '@sentry/nextjs'
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible'
import { z } from 'zod'
import { createMiddleware, createSafeActionClient } from 'next-safe-action'
import { ReplyError } from 'ioredis'
import { headers } from 'next/headers'

import { getUnsafeIp } from '$/helpers/ip'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { Dataset } from '@latitude-data/core/browser'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { cache } from '@latitude-data/core/cache'
import {
  LatitudeError,
  RateLimitError,
  UnauthorizedError,
} from '@latitude-data/constants/errors'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  EvaluationsV2Repository,
  ProjectsRepository,
} from '@latitude-data/core/repositories'
import { getDataFromSession } from '$/data-access'

const DEFAULT_RATE_LIMIT_POINTS = 1000
const DEFAULT_RATE_LIMIT_DURATION = 60

/**
 * Base action client with error handling.
 */
export const errorHandlingProcedure = createSafeActionClient({
  throwValidationErrors: true,
  defaultValidationErrorsShape: 'flattened',
  handleServerError: async (error) => {
    if (error instanceof LatitudeError) return

    try {
      const data = await getCurrentUserOrRedirect()
      Sentry.captureException(error, {
        user: {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
        },
      })
    } catch {
      Sentry.captureException(error)
    }
  },
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

export const withProjectSchema = z.object({
  projectId: z.number().or(z.string()),
})

/**
 * With project procedure.
 */
export const withProject = authProcedure.use(
  async ({ next, ctx, clientInput }) => {
    // FIXME: Check what happens without passing a projectId. How this fails
    const { projectId } = withProjectSchema.parse(clientInput)
    const projectScope = new ProjectsRepository(ctx.workspace.id)
    const project = await projectScope
      .getProjectById(Number(projectId))
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
    // FIXME: Check what happens without passing a projectId. How this fails
    const { commitUuid } = withCommitSchema.parse(clientInput)

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
    // FIXME: Check what happens without passing a projectId. How this fails
    const { documentUuid } = withDocumentSchema.parse(clientInput)
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
    // FIXME: Check what happens without passing a projectId. How this fails
    const { evaluationUuid } = withEvaluationSchema.parse(clientInput)

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
    // FIXME: Check what happens without passing a projectId. How this fails
    const { datasetId } = withDatasetSchema.parse(clientInput)

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

      ctx.workspace
      return next({ ctx })
    },
  )
}
