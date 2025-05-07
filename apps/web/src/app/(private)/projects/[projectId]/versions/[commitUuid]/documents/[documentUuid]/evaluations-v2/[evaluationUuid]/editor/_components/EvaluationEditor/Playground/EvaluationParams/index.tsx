import {
  DocumentVersion,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetricAnyCustom,
} from '@latitude-data/core/browser'
import { ICommitContextType } from '@latitude-data/web-ui/providers'
import { OnToggleFn } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { useLogHistoryParams } from './HistoryLogParams/useLogHistoryParams'
import { HistoryLogParams } from './HistoryLogParams'

export type Props = {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetricAnyCustom>
  onToggle?: OnToggleFn
  isExpanded?: boolean
  selectedDocumentLogUuid?: string
}
export default function EvaluationParams({
  onToggle,
  isExpanded,
  document,
  evaluation,
  commit,
  selectedDocumentLogUuid,
}: Props) {
  const historyInfo = useLogHistoryParams({
    commitVersionUuid: commit.uuid,
    document,
    evaluation,
    selectedDocumentLogUuid,
  })

  return (
    <ClientOnly>
      <CollapsibleBox
        paddingBottom={false}
        paddingRight={false}
        scrollable={false}
        title='Log parameters'
        icon='braces'
        isExpanded={isExpanded}
        onToggle={onToggle}
        expandedContent={
          <HistoryLogParams
            commit={commit}
            document={document}
            evaluation={evaluation}
            data={historyInfo}
          />
        }
      />
    </ClientOnly>
  )
}
