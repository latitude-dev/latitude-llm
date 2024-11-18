'use server'

import { EvaluationResultableType } from '@latitude-data/core/browser'
import { findLastProviderLogFromDocumentLogUuid } from '@latitude-data/core/data-access'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { generateUUIDIdentifier } from '@latitude-data/core/lib/generateUUID'
import {
  DocumentLogsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { createEvaluationResult } from '@latitude-data/core/services/evaluationResults/create'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const createEvaluationResultAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      evaluationId: z.number(),
      documentLogId: z.number(),
      type: z.nativeEnum(EvaluationResultableType),
      value: z.union([z.boolean(), z.number(), z.string()]),
      reason: z.string().optional(),
      metadata: z.record(z.any()).optional(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const evaluation = await new EvaluationsRepository(ctx.workspace.id)
      .find(input.evaluationId)
      .then((r) => r.unwrap())
    const documentLog = await new DocumentLogsRepository(ctx.workspace.id)
      .find(input.documentLogId)
      .then((r) => r.unwrap())
    const evaluatedProviderLog = await findLastProviderLogFromDocumentLogUuid(
      documentLog.uuid,
    )
    if (!evaluatedProviderLog) {
      throw new NotFoundError(
        `No evaluated provider log found for document log ${documentLog.uuid}`,
      )
    }

    const result = await createEvaluationResult({
      uuid: generateUUIDIdentifier(),
      evaluation,
      documentLog,
      evaluatedProviderLog,
      result: {
        result: input.value,
        reason: input.reason,
      },
    })

    return result.unwrap()
  })
