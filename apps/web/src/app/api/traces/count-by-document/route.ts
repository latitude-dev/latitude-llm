import { z } from 'zod'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { LogSources } from '@latitude-data/constants'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'
import { countTracesByDocument } from '@latitude-data/core/data-access/traces/countByDocument'

const validLogSources = z.enum(Object.values(LogSources))
const searchParamsSchema = z.object({
  projectId: z.string(),
  commitUuid: z.string().optional(),
  documentUuid: z.string().optional(),
  logSources: z
    .string()
    .transform((val) => {
      if (!val || val === '') return undefined
      const sources = val.split(',')

      return validLogSources.array().parse(sources)
    })
    .optional(),
})

export const GET = errorHandler(
  authHandler(
    async (request: NextRequest, { workspace }: { workspace: Workspace }) => {
      const searchParams = request.nextUrl.searchParams
      const parsedParams = searchParamsSchema.parse({
        projectId: searchParams.get('projectId') ?? undefined,
        commitUuid: searchParams.get('commitUuid') ?? undefined,
        documentUuid: searchParams.get('documentUuid') ?? undefined,
        logSources: searchParams.get('logSources') ?? undefined,
      })
      const { projectId, commitUuid, documentUuid } = parsedParams
      const commitsRepo = new CommitsRepository(workspace.id)
      const commit = await commitsRepo
        .getCommitByUuid({ uuid: commitUuid!, projectId: Number(projectId) })
        .then((r) => r.unwrap())
      const count = await countTracesByDocument({
        workspace,
        commit,
        documentUuid: documentUuid!,
        logSources: parsedParams.logSources,
      })

      return NextResponse.json({ count }, { status: 200 })
    },
  ),
)
