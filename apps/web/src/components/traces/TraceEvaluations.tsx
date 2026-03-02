import { useMemo } from 'react'
import Link from 'next/link'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useEvaluationEditorLink } from '$/lib/useEvaluationEditorLink'
import { SpanType, SpanWithDetails } from '@latitude-data/constants'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ROUTES } from '$/services/routes'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import {
  EvaluationResultsList,
  EvaluationResultActionsProps,
} from '$/components/evaluations/EvaluationResultsList'
import useEvaluationResultsV2BySpans from '$/stores/evaluationResultsV2/bySpans'

function TraceEvaluationActions({
  item,
  documentUuid,
  span,
}: EvaluationResultActionsProps & {
  documentUuid: string
  span: SpanWithDetails<SpanType> | undefined
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const document = useMemo(
    () => ({ documentUuid, commitId: commit.id }),
    [documentUuid, commit.id],
  )

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

  return (
    <div className='flex items-center gap-2'>
      <Link
        href={getEvaluationV2Url({
          evaluationUuid: item.evaluation.uuid,
          documentLogUuid: span?.documentLogUuid,
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
      <Link href={viewLogUrl} target='_blank'>
        <Button variant='outline' fancy size='small'>
          View log
        </Button>
      </Link>
    </div>
  )
}

export function TraceEvaluationsTab({
  documentUuid,
  spanId,
  documentLogUuid,
  span,
}: {
  documentUuid: string
  spanId: string
  documentLogUuid: string
  span: SpanWithDetails<SpanType> | undefined
}) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const document = useMemo(
    () => ({ documentUuid, commitId: commit.id }),
    [documentUuid, commit.id],
  )

  const { data: results, isLoading } = useEvaluationResultsV2BySpans({
    project,
    commit,
    document,
    spanId,
    documentLogUuid,
  })

  const Actions = ({ item }: EvaluationResultActionsProps) => (
    <TraceEvaluationActions
      item={item}
      documentUuid={documentUuid}
      span={span}
    />
  )

  return (
    <EvaluationResultsList
      results={results}
      isLoading={isLoading}
      emptyMessage='There are no evaluation results for this log'
      actions={Actions}
    />
  )
}
