import {
  EvaluationDto,
  EvaluationMetadataLlmAsJudgeAdvanced,
  EvaluationMetadataType,
  ProviderApiKey,
} from '@latitude-data/core/browser'

import AdvancedEvaluationEditor from './Advanced'
import SimpleEvaluationEditor from './Simple'

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
        defaultPrompt={evaluationMetadata.prompt}
        evaluationUuid={evaluationUuid}
        freeRunsCount={freeRunsCount}
        providerApiKeys={providerApiKeys}
      />
    )
  }

  return <SimpleEvaluationEditor evaluation={evaluation} />
}
