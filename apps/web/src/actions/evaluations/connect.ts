'use server'

import { filterEvaluationTemplatesById } from '@latitude-data/core/data-access'
import {
  DocumentVersionsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { connectEvaluations } from '@latitude-data/core/services/evaluations/connect'
import { z } from 'zod'

import { withProject } from '../procedures'

export const connectEvaluationsAction = withProject
  .createServerAction()
  .input(
    z.object({
      documentUuid: z.string(),
      commitUuid: z.string(),
      templateIds: z.array(z.number()),
      evaluationUuids: z.array(z.string()),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const selectedTemplates = await filterEvaluationTemplatesById(
      input.templateIds,
    ).then((r) => r.unwrap())
    const scope = new EvaluationsRepository(ctx.workspace.id)
    const selectedEvaluations = await scope
      .filterByUuids(input.evaluationUuids)
      .then((r) => r.unwrap())

    const documentsScope = new DocumentVersionsRepository(ctx.workspace.id)
    const document = await documentsScope
      .getDocumentAtCommit({
        projectId: ctx.project.id,
        commitUuid: input.commitUuid,
        documentUuid: input.documentUuid,
      })
      .then((r) => r.unwrap())

    const connectedEvaluations = await connectEvaluations({
      document,
      templates: selectedTemplates,
      evaluations: selectedEvaluations,
    }).then((r) => r.unwrap())

    return connectedEvaluations
  })
