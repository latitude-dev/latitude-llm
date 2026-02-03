import { use } from 'react'
import Link from 'next/link'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ResultWithEvaluationV2 } from '@latitude-data/core/schema/types'
import {
  EvaluationResultsList,
  EvaluationResultActionsProps,
} from '$/components/evaluations/EvaluationResultsList'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useEvaluationEditorLink } from '$/lib/useEvaluationEditorLink'
import { ROUTES } from '$/services/routes'
import { TraceSpanSelectionActionsContext } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/(withTabs)/traces/_components/TraceSpanSelectionContext'
import { AssembledSpan } from '@latitude-data/constants'

function ConversationEvaluationActions({
  item,
  conversationId,
}: EvaluationResultActionsProps & { conversationId: string }) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { selectSpan } = use(TraceSpanSelectionActionsContext)

  const getEvaluationV2Url = useEvaluationEditorLink({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
  })

  const query = new URLSearchParams()
  query.set('resultUuid', item.result.uuid)

  const viewLogUrl =
    ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid })
      .documents.detail({ uuid: document.documentUuid })
      .evaluations.detail({ uuid: item.evaluation.uuid }).root +
    `?${query.toString()}`

  const handleViewSpan = () => {
    if (item.result.evaluatedSpanId) {
      selectSpan({
        id: item.result.evaluatedSpanId,
        documentLogUuid: conversationId,
      } as AssembledSpan)
    }
  }

  return (
    <div className='flex items-center gap-2'>
      <Link
        href={getEvaluationV2Url({
          evaluationUuid: item.evaluation.uuid,
          documentLogUuid: conversationId,
        })}
        target='_blank'
      >
        <Button
          variant='link'
          iconProps={{
            name: 'externalLink',
            widthClass: 'w-4',
            heightClass: 'h-4',
            placement: 'right',
          }}
        >
          Edit
        </Button>
      </Link>
      {item.result.evaluatedSpanId && (
        <Button variant='outline' size='small' onClick={handleViewSpan}>
          View span
        </Button>
      )}
      <Link href={viewLogUrl} target='_blank'>
        <Button variant='outline' fancy size='small'>
          View log
        </Button>
      </Link>
    </div>
  )
}

export function ConversationEvaluations({
  results,
  isLoading,
  conversationId,
}: {
  results: ResultWithEvaluationV2[]
  isLoading: boolean
  conversationId: string
}) {
  const Actions = ({ item }: EvaluationResultActionsProps) => (
    <ConversationEvaluationActions
      item={item}
      conversationId={conversationId}
    />
  )

  return (
    <EvaluationResultsList
      results={results}
      isLoading={isLoading}
      emptyMessage='There are no evaluation results for this conversation'
      actions={Actions}
    />
  )
}
