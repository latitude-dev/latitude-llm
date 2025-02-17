import {
  evaluationMetadataTypes,
  evaluationResultTypes,
} from '$/app/(private)/evaluations/_components/ActiveEvaluations/Table'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { EvaluationRoutes, ROUTES } from '$/services/routes'
import {
  EvaluationMetadataType,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import { ResultWithEvaluation } from '@latitude-data/core/repositories'
import {
  Button,
  Text,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import Link from 'next/link'
import { MetadataItem } from '../../../../_components/MetadataItem'
import { ResultCellContent } from '../../../../evaluations/[evaluationId]/_components/EvaluationResults/EvaluationResultsTable'

function EvaluationResultItem({ result, evaluation }: ResultWithEvaluation) {
  if (result.resultableType === EvaluationResultableType.Text) {
    return (
      <Text.H5 align='left' color='foregroundMuted'>
        {result.result || '-'}
      </Text.H5>
    )
  }

  return <ResultCellContent evaluation={evaluation} value={result.result} />
}

function evaluationResultLink({ result, evaluation }: ResultWithEvaluation) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const query = new URLSearchParams()
  if (evaluation.metadataType === EvaluationMetadataType.Manual) {
    query.set('documentLogId', result.documentLogId.toString())
  } else {
    query.set('resultUuid', result.uuid)
  }

  return (
    ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid })
      .documents.detail({ uuid: document.documentUuid })
      .evaluations.detail(evaluation.id).root + `?${query.toString()}`
  )
}

function evaluationEditorLink({ result, evaluation }: ResultWithEvaluation) {
  const query = new URLSearchParams()
  if (result.evaluatedProviderLogId) {
    query.set('providerLogId', result.evaluatedProviderLogId.toString())
  }

  return (
    ROUTES.evaluations.detail({ uuid: evaluation.uuid })[
      EvaluationRoutes.editor
    ].root + `?${query.toString()}`
  )
}

export function DocumentLogEvaluations({
  evaluationResults = [],
}: {
  evaluationResults?: ResultWithEvaluation[]
}) {
  if (!evaluationResults.length) {
    return (
      <Text.H5 color='foregroundMuted' centered>
        There are no evaluation results for this log
      </Text.H5>
    )
  }

  return (
    <ul className='flex flex-col gap-4 divide-y divide-border'>
      {evaluationResults.map(({ result, evaluation }) => (
        <li key={result.uuid} className='flex flex-col gap-2 pt-4 first:pt-0'>
          <span className='flex justify-between items-center gap-2 w-full'>
            <Text.H4M noWrap ellipsis>
              {evaluation.name}
            </Text.H4M>
            <Link
              href={evaluationEditorLink({ result, evaluation })}
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
          </span>
          <div className='flex flex-col gap-2.5'>
            <MetadataItem
              stacked
              label='Type'
              value={`${evaluationResultTypes[evaluation.resultType]} - ${evaluationMetadataTypes[evaluation.metadataType]}`}
            />
            <MetadataItem stacked label='Result'>
              <EvaluationResultItem result={result} evaluation={evaluation} />
            </MetadataItem>
            <MetadataItem
              stacked
              label='Reasoning'
              value={result.reason || '-'}
            />
          </div>
          <div className='w-full flex justify-start'>
            <Link
              href={evaluationResultLink({ result, evaluation })}
              target='_blank'
            >
              <Button variant='outline' fancy>
                View log
              </Button>
            </Link>
          </div>
        </li>
      ))}
    </ul>
  )
}
