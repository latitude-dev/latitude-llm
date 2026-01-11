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
  ProjectsRepository,
  DatasetsRepository,
} from '@latitude-data/core/repositories'
import { getDataFromSession } from '$/data-access'
import { flattenErrors } from '@latitude-data/core/lib/zodUtils'
import {
  WorkspacePermission,
  WorkspacePermissions,
  assertWorkspacePermission,
} from '@latitude-data/core/permissions/workspace'

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
 * Base auth procedure including membership context.
 */
export const workspaceAuthProcedure = errorHandlingProcedure.use(
  async ({ next, ctx }) => {
    const data = await getDataFromSession()

    if (!data.user || !data.workspace || !data.membership) {
      throw new UnauthorizedError('Unauthorized')
    }

    return next({
      ctx: {
        ...ctx,
        session: data.session,
        workspace: data.workspace,
        user: data.user,
        membership: data.membership,
        workspacePermissions: data.workspacePermissions,
      },
    })
  },
)

/**
 * Admin (workspace) procedure.
 */
export const authProcedure = workspaceAuthProcedure.use(({ next, ctx }) => {
  assertWorkspacePermission({
    role: ctx.membership.role,
    permissions: ctx.workspacePermissions,
    permission: WorkspacePermissions.ManageWorkspace,
  })

  return next({ ctx })
})

export function withWorkspacePermission(permission: WorkspacePermission) {
  return workspaceAuthProcedure.use(({ next, ctx }) => {
    assertWorkspacePermission({
      role: ctx.membership.role,
      permissions: ctx.workspacePermissions,
      permission,
    })

    return next({ ctx })
  })
}

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
    if (!data.user || !data.workspace || !data.membership) {
      return next({ ctx })
    }
    return next({
      ctx: {
        ...ctx,
        session: data.session,
        workspace: data.workspace,
        user: data.user,
        membership: data.membership,
        workspacePermissions: data.workspacePermissions,
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

const buildWithProject = (
  procedure: typeof workspaceAuthProcedure,
  permission?: WorkspacePermission,
) =>
  (permission ? withWorkspacePermission(permission) : procedure).use(
    async ({ next, ctx, clientInput }) => {
      const { projectId } = validateSchema(withProjectSchema, clientInput)
      const projectScope = new ProjectsRepository(ctx.workspace.id)
      const project = await projectScope
        .getProjectById(Number(projectId))
        .then((r) => r.unwrap())

      return next({ ctx: { ...ctx, project } })
    },
  )

export const withProject = buildWithProject(authProcedure)
export const withProjectForAnnotations = buildWithProject(
  workspaceAuthProcedure,
  WorkspacePermissions.WriteAnnotations,
)

export const withCommitSchema = withProjectSchema.extend({
  commitUuid: z.string(),
})

const buildWithCommit = (procedure: ReturnType<typeof buildWithProject>) =>
  procedure.use(async ({ next, ctx, clientInput }) => {
    const { commitUuid } = validateSchema(withCommitSchema, clientInput)
    const repository = new CommitsRepository(ctx.workspace.id)
    const commit = await repository
      .getCommitByUuid({
        projectId: ctx.project.id,
        uuid: commitUuid,
      })
      .then((r) => r.unwrap())

    return next({ ctx: { ...ctx, commit } })
  })

export const withCommit = buildWithCommit(withProject)
export const withCommitForAnnotations = buildWithCommit(
  withProjectForAnnotations,
)

export const withDocumentSchema = withCommitSchema.extend({
  documentUuid: z.string(),
})

const buildWithDocument = (procedure: ReturnType<typeof buildWithCommit>) =>
  procedure.use(async ({ next, ctx, clientInput }) => {
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
  })

export const withDocument = buildWithDocument(withCommit)
export const withDocumentForAnnotations = buildWithDocument(
  withCommitForAnnotations,
)

export const withEvaluationSchema = withDocumentSchema.extend({
  evaluationUuid: z.string(),
})

const buildWithEvaluation = (procedure: ReturnType<typeof buildWithDocument>) =>
  procedure.use(async ({ next, ctx, clientInput }) => {
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
  })

export const withEvaluation = buildWithEvaluation(withDocument)
export const withEvaluationForAnnotations = buildWithEvaluation(
  withDocumentForAnnotations,
)

export const withDatasetSchema = withDocumentSchema.extend({
  datasetId: z.number(),
})

const buildWithDataset = (procedure: ReturnType<typeof buildWithDocument>) =>
  procedure.use(async ({ next, ctx, clientInput }) => {
    const { datasetId } = validateSchema(withDatasetSchema, clientInput)
    const repo = new DatasetsRepository(ctx.workspace.id)
    const dataset = await repo.find(datasetId).then((r) => r.unwrap())
    return next({ ctx: { ...ctx, dataset: dataset as Dataset } })
  })

export const withDataset = buildWithDataset(withDocument)
export const withDatasetForAnnotations = buildWithDataset(
  withDocumentForAnnotations,
)

type DataFromSession = Awaited<ReturnType<typeof getDataFromSession>>

type RateLimitCtx = {
  session?: DataFromSession['session']
  user?: DataFromSession['user']
  workspace?: DataFromSession['workspace']
  membership?: DataFromSession['membership']
  workspacePermissions?: DataFromSession['workspacePermissions']
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
