import {
  Chain,
  ConversationMetadata,
  readMetadata,
} from '@latitude-data/compiler'

import { DocumentLog, EvaluationDto } from '../../../browser'
import { LatitudeError, Result, TypedResult } from '../../../lib'
import { ProviderLogsRepository } from '../../../repositories'
import { PARAMETERS_FROM_LOG } from './constants'

export async function buildEvaluationChain(
  evaluation: EvaluationDto,
  documentLog: DocumentLog,
): Promise<TypedResult<Chain, LatitudeError>> {
  const providerLogScope = new ProviderLogsRepository(evaluation.workspaceId)
  const providerLogResult = await providerLogScope.findLastByDocumentLogUuid(
    documentLog.uuid,
  )
  if (providerLogResult.error) return providerLogResult
  const providerLog = providerLogResult.value

  const parameters = Object.fromEntries(
    Object.entries(PARAMETERS_FROM_LOG).map(([name, getValueFromLog]) => {
      return [name, getValueFromLog({ documentLog, providerLog })]
    }),
  )

  const chain = new Chain({ prompt: evaluation.metadata.prompt, parameters })
  return Result.ok(chain)
}

export async function readMetadataFromEvaluation(
  evaluation: EvaluationDto,
): Promise<TypedResult<ConversationMetadata, LatitudeError>> {
  const metadata = await readMetadata({
    prompt: evaluation.metadata.prompt,
    withParameters: Object.keys(PARAMETERS_FROM_LOG),
  })

  return Result.ok(metadata)
}

export { PARAMETERS_FROM_LOG }
