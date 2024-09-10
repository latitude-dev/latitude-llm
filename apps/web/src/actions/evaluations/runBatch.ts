import {
  DatasetsRepository,
  DocumentVersionsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { setupJobs } from '@latitude-data/jobs'
import { nanoid } from 'nanoid'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const runBatchAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      datasetId: z.number(),
      projectId: z.number(),
      documentUuid: z.string(),
      commitUuid: z.string(),
      fromLine: z.number(),
      toLine: z.number(),
      parameters: z.record(z.number()).optional(),
      evaluationIds: z.array(z.number()),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const evaluationsRepo = new EvaluationsRepository(ctx.workspace.id)
    const evaluations = await evaluationsRepo
      .filterById(input.evaluationIds)
      .then((r) => r.unwrap())

    const datasetsRepo = new DatasetsRepository(ctx.workspace.id)
    const dataset = await datasetsRepo
      .find(input.datasetId)
      .then((r) => r.unwrap())

    const docsRepo = new DocumentVersionsRepository(ctx.workspace.id)
    const document = await docsRepo
      .getDocumentAtCommit({
        projectId: input.projectId,
        commitUuid: input.commitUuid,
        documentUuid: input.documentUuid,
      })
      .then((r) => r.unwrap())

    const queues = setupJobs()

    evaluations.forEach((evaluation) => {
      const batchId = `evaluation:${evaluation.id}:${nanoid(5)}`

      queues.defaultQueue.jobs.enqueueRunBatchEvaluationJob({
        evaluation,
        dataset,
        document,
        fromLine: input.fromLine,
        toLine: input.toLine,
        parametersMap: input.parameters,
        batchId,
      })
    })

    return { success: true }
  })
