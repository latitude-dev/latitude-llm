'use server'

import { MAX_SIZE, MAX_UPLOAD_SIZE_IN_MB } from '@latitude-data/core/browser'
import { CommitsRepository } from '@latitude-data/core/repositories'
import {
  createNewDocument,
  defaultDocumentContent,
} from '@latitude-data/core/services/documents/create'
import { convertFile } from '@latitude-data/core/services/files/convert'
import { z } from 'zod'

import { withProject, withProjectSchema } from '../procedures'

export const uploadDocumentAction = withProject
  .inputSchema(
    withProjectSchema.extend({
      path: z.string(),
      commitUuid: z.string(),
      file: z.instanceof(File).refine(async (file) => {
        return file?.size <= MAX_UPLOAD_SIZE_IN_MB
      }, `Your file must be less than ${MAX_SIZE}MB in size. You can split it into smaller files and upload them separately.`),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const commitsScope = new CommitsRepository(ctx.project.workspaceId)
    const commit = await commitsScope
      .getCommitByUuid({
        uuid: parsedInput.commitUuid,
        projectId: ctx.project.id,
      })
      .then((r) => r.unwrap())

    const content = await convertFile(parsedInput.file).then((r) => r.unwrap())
    const { metadata } = await defaultDocumentContent({
      workspace: ctx.workspace,
    })

    const result = await createNewDocument({
      workspace: ctx.workspace,
      user: ctx.user,
      commit: commit,
      path: parsedInput.path,
      content: metadata + content,
    })

    return result.unwrap()
  })
