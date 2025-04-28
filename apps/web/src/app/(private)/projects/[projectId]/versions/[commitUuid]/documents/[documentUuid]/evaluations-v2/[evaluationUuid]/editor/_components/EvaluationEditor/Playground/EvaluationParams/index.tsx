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
import {
  type UseLogHistoryParams,
  useLogHistoryParams,
} from './HistoryLogParams/useLogHistoryParams'
import { HistoryLogParams } from './HistoryLogParams'

export type Props = {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetricAnyCustom>
  onToggle?: OnToggleFn
  isExpanded?: boolean
}
type ContentProps = Props & { historyInfo: UseLogHistoryParams }

function ExpandedContent({
  historyInfo,
  commit,
  document,
  evaluation,
}: ContentProps) {
  return (
    <div className='w-full flex flex-col gap-4'>
      <HistoryLogParams
        commit={commit}
        document={document}
        evaluation={evaluation}
        data={historyInfo}
      />
    </div>
  )
}

export default function EvaluationParams({
  onToggle,
  isExpanded,
  ...props
}: Props) {
  const commit = props.commit
  const historyInfo = useLogHistoryParams({
    commitVersionUuid: commit.uuid,
    document: props.document,
    evaluation: props.evaluation,
  })

  const contentProps = { ...props, historyInfo }

  return (
    <ClientOnly>
      <CollapsibleBox
        title='Log parameters'
        icon='braces'
        isExpanded={isExpanded}
        onToggle={onToggle}
        expandedContent={<ExpandedContent {...contentProps} />}
      />
    </ClientOnly>
  )
}
