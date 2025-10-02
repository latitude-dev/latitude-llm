import { OpenInDocsButton } from '$/components/Documentation/OpenInDocsButton'
import { DocsRoute } from '$/components/Documentation/routes'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import {
  CollapsibleBox,
  OnToggleFn,
} from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { ICommitContextType } from '@latitude-data/web-ui/providers'
import { HistoryLogParams } from './HistoryLogParams'
import { UseLogHistoryParams } from './HistoryLogParams/useLogHistoryParams'
import { DocumentVersion } from '@latitude-data/core/schema/types'
import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetricAnyCustom,
} from '@latitude-data/core/constants'

export type Props = {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetricAnyCustom>
  historyInfo: UseLogHistoryParams
  onToggle?: OnToggleFn
  isExpanded?: boolean
}
export default function EvaluationParams({
  onToggle,
  isExpanded,
  document,
  evaluation,
  commit,
  historyInfo,
}: Props) {
  return (
    <ClientOnly loader={<Skeleton className='h-full w-full rounded-lg' />}>
      <CollapsibleBox
        paddingBottom={false}
        paddingRight={false}
        scrollable={false}
        title='Parameters'
        icon='braces'
        isExpanded={isExpanded}
        onToggle={onToggle}
        collapsedContentHeader={
          <div className='flex flex-row flex-grow items-center justify-start'>
            <OpenInDocsButton route={DocsRoute.Playground} />
          </div>
        }
        expandedContent={
          <HistoryLogParams
            commit={commit}
            document={document}
            evaluation={evaluation}
            data={historyInfo}
          />
        }
        expandedContentHeader={
          <div className='flex flex-row flex-grow items-center justify-start'>
            <OpenInDocsButton route={DocsRoute.Playground} />
          </div>
        }
      />
    </ClientOnly>
  )
}
