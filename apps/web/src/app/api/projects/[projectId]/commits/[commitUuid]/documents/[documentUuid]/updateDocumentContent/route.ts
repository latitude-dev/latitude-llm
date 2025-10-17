import { z, ZodSafeParseError } from 'zod'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { NextRequest, NextResponse } from 'next/server'

import { updateDocumentContent } from '@latitude-data/core/services/documents/updateDocumentContent/updateContent'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import {
  AbortedError,
  LatitudeErrorDetails,
  UnprocessableEntityError,
} from '@latitude-data/constants/errors'

const inputSchema = z.object({
  prompt: z.string().min(1, { error: 'Prompt is required' }),
})
type Input = z.infer<typeof inputSchema>

function formatErrors(parsed: ZodSafeParseError<Input>): LatitudeErrorDetails {
  const tree = z.treeifyError(parsed.error)

  if (!tree.properties) return {}

  return Object.fromEntries(
    Object.entries(tree.properties).map(([key, value]) => [key, value?.errors]),
  )
}

function withAbort<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new AbortedError('Document update aborted'))
    signal.addEventListener('abort', onAbort, { once: true })
    work()
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort))
  })
}

export const POST = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        params,
        workspace,
      }: {
        params: {
          projectId: number
          commitUuid: string
          documentUuid: string
        }
        workspace: Workspace
      },
    ) => {
      const { projectId, commitUuid, documentUuid } = params
      const data = await withAbort(req.signal, async () => {
        req.signal.throwIfAborted()

        const body = await req.json()
        const parseResult = inputSchema.safeParse(body)
        if (!parseResult.success) {
          throw new UnprocessableEntityError(
            'Invalid input',
            formatErrors(parseResult),
          )
        }

        const commitsRepository = new CommitsRepository(workspace.id)
        const commit = await commitsRepository
          .getCommitByUuid({ projectId, uuid: commitUuid })
          .then((r) => r.unwrap())

        const documentsRepository = new DocumentVersionsRepository(workspace.id)
        const document = await documentsRepository
          .getDocumentAtCommit({
            projectId: projectId,
            commitUuid: commitUuid,
            documentUuid: documentUuid,
          })
          .then((r) => r.unwrap())

        return updateDocumentContent({
          workspace,
          commit,
          document,
          prompt: parseResult.data.prompt,
        }).then((r) => r.unwrap())
      })

      return NextResponse.json(data, { status: 200 })
    },
  ),
)
