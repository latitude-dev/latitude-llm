import { BadRequestError } from '@latitude-data/constants/errors'
import { Result } from '../../../../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../../../repositories'
import { defineLatteTool } from '../types'
import { z } from 'zod'
import { executeLatteActions } from './latteActions/executeActions'
import { CompileError } from '@latitude-data/compiler'

const editProject = defineLatteTool(
  async ({ projectId, versionUuid, actions }, { workspace, threadUuid }) => {
    const commitsScope = new CommitsRepository(workspace.id)
    const commitResult = await commitsScope.getCommitByUuid({
      projectId: projectId,
      uuid: versionUuid,
    })
    if (!commitResult.ok) return commitResult
    const commit = commitResult.unwrap()

    if (commit.mergedAt) {
      return Result.error(
        new BadRequestError(
          `Cannot edit a merged commit. Select an existing draft or create a new one.`,
        ),
      )
    }

    const documentsScope = new DocumentVersionsRepository(workspace.id)
    const documents = await documentsScope
      .getDocumentsAtCommit(commit)
      .then((r) => r.unwrap())

    const { changes, metadatas } = await executeLatteActions({
      workspace,
      threadUuid,
      commit,
      documents,
      actions,
    }).then((r) => r.unwrap())

    const errors: Record<string, CompileError[]> = Object.fromEntries(
      Object.entries(metadatas)
        .map(([path, metadata]) => [path, metadata.errors])
        .filter(([, errors]) => !!errors?.length),
    )

    return Result.ok({
      changes,
      errors,
    })
  },
  z.object({
    projectId: z.number(),
    versionUuid: z.string(),
    actions: z.array(
      z.union([
        z.object({
          type: z.literal('prompt'),
          operation: z.literal('update'),
          promptUuid: z.string(),
          path: z.string().optional(),
          content: z.string().optional(),
        }),
        z.object({
          type: z.literal('prompt'),
          operation: z.literal('create'),
          path: z.string(),
          content: z.string(),
        }),
        z.object({
          type: z.literal('prompt'),
          operation: z.literal('delete'),
          promptUuid: z.string(),
        }),
      ]),
    ),
  }),
)

export default editProject
