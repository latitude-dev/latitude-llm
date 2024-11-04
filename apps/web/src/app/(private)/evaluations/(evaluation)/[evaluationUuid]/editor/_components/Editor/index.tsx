import {
  EvaluationDto,
  EvaluationMetadataLlmAsJudgeAdvanced,
  EvaluationMetadataType,
  ProviderApiKey,
} from '@latitude-data/core/browser'

import AdvancedEvaluationEditor from './Advanced'

export default function EvaluationEditor({
  evaluation,
  providerApiKeys,
  evaluationUuid,
  freeRunsCount,
}: {
  evaluation: EvaluationDto
  providerApiKeys: ProviderApiKey[]
  evaluationUuid: string
  freeRunsCount: number | undefined
}) {
  if (evaluation.metadataType === EvaluationMetadataType.LlmAsJudgeAdvanced) {
    const evaluationMetadata =
      evaluation.metadata as EvaluationMetadataLlmAsJudgeAdvanced
    return (
      <AdvancedEvaluationEditor
        providerApiKeys={providerApiKeys}
        evaluationUuid={evaluationUuid}
        freeRunsCount={freeRunsCount}
        defaultPrompt={evaluationMetadata.prompt}
      />
    )
  }

  return null
}
