import { getDataFromSession } from '$/data-access'
import { getUnsafeIp } from '$/helpers/ip'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import {
  LatitudeError,
  RateLimitError,
  UnauthorizedError,
} from '@latitude-data/constants/errors'
import { Dataset } from '@latitude-data/core/browser'
import { cache } from '@latitude-data/core/cache'
import {
  CommitsRepository,
  DatasetsRepository,
  DocumentVersionsRepository,
  EvaluationsV2Repository,
  ProjectsRepository,
} from '@latitude-data/core/repositories'
import * as Sentry from '@sentry/nextjs'
import { ReplyError } from 'ioredis'
import { headers } from 'next/headers'
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible'
import { z } from 'zod'
import { createServerActionProcedure, TAnyCompleteProcedure } from 'zsa'

const DEFAULT_RATE_LIMIT_POINTS = 1000
const DEFAULT_RATE_LIMIT_DURATION = 60

export const errorHandlingProcedure = createServerActionProcedure()
  .onError(async (error) => {
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
    } catch (_) {
      Sentry.captureException(error)
    }
  })
  .handler((ctx) => ({ ...ctx }))

export const maybeAuthProcedure = createServerActionProcedure(
  errorHandlingProcedure,
).handler(async () => {
  const data = await getDataFromSession()
  if (!data.user || !data.workspace) {
    return {}
  }

  return {
    session: data.session,
    workspace: data.workspace,
    user: data.user,
  }
})

export const authProcedure = createServerActionProcedure(
  errorHandlingProcedure,
).handler(async () => {
  const data = await getDataFromSession()
  if (!data.user || !data.workspace) {
    throw new UnauthorizedError('Unauthorized')
  }

  return {
    session: data.session,
    workspace: data.workspace,
    user: data.user,
  }
})

export const withProject = createServerActionProcedure(authProcedure)
  .input(z.object({ projectId: z.number().or(z.string()) }))
  .handler(async ({ input, ctx }) => {
    const { workspace } = ctx
    const projectScope = new ProjectsRepository(workspace.id)
    const project = (
      await projectScope.getProjectById(Number(input.projectId))
    ).unwrap()

    return { ...ctx, project }
  })

export const withCommit = createServerActionProcedure(withProject)
  .input(z.object({ commitUuid: z.string() }))
  .handler(async ({ input, ctx }) => {
    const repository = new CommitsRepository(ctx.workspace.id)
    const commit = await repository
      .getCommitByUuid({
        projectId: ctx.project.id,
        uuid: input.commitUuid,
      })
      .then((r) => r.unwrap())

    return { ...ctx, commit }
  })

export const withDocument = createServerActionProcedure(withCommit)
  .input(z.object({ documentUuid: z.string() }))
  .handler(async ({ input, ctx }) => {
    const repo = new DocumentVersionsRepository(ctx.workspace.id)
    const document = await repo
      .getDocumentAtCommit({
        projectId: ctx.project.id,
        commitUuid: ctx.commit.uuid,
        documentUuid: input.documentUuid,
      })
      .then((r) => r.unwrap())

    return { ...ctx, document, currentCommitUuid: input.commitUuid }
  })

export const withEvaluation = createServerActionProcedure(withDocument)
  .input(z.object({ evaluationUuid: z.string() }))
  .handler(async ({ input, ctx }) => {
    const repository = new EvaluationsV2Repository(ctx.workspace.id)
    const evaluation = await repository
      .getAtCommitByDocument({
        projectId: ctx.project.id,
        commitUuid: ctx.commit.uuid,
        documentUuid: ctx.document.documentUuid,
        evaluationUuid: input.evaluationUuid,
      })
      .then((r) => r.unwrap())

    return { ...ctx, evaluation }
  })

export const withAdmin = createServerActionProcedure(authProcedure).handler(
  async ({ ctx }) => {
    if (!ctx.user.admin) throw new UnauthorizedError('Unauthorized')

    return ctx
  },
)

export async function withRateLimit<T extends TAnyCompleteProcedure>(
  procedure: T,
  {
    limit = DEFAULT_RATE_LIMIT_POINTS,
    period = DEFAULT_RATE_LIMIT_DURATION,
  }: {
    limit?: number
    period?: number
  },
): Promise<T> {
  const rateLimiter = new RateLimiterRedis({
    storeClient: await cache(),
    points: limit,
    duration: period,
  })

  return createServerActionProcedure(procedure).handler(
    async ({ ctx, ...rest }) => {
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

      return { ...ctx, ...rest }
    },
  ) as T
}

export const withDataset = createServerActionProcedure(withDocument)
  .input(
    z.object({
      datasetId: z.number(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const repo = new DatasetsRepository(ctx.workspace.id)
    const dataset = await repo.find(input.datasetId).then((r) => r.unwrap())

    return { ...ctx, dataset: dataset as Dataset }
  })
