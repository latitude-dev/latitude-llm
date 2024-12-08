import {
  EvaluationMetadataType,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import { ResultWithEvaluation } from '@latitude-data/core/repositories'
import {
  Button,
  Icon,
  Text,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import {
  evaluationMetadataTypes,
  evaluationResultTypes,
} from '$/app/(private)/evaluations/_components/ActiveEvaluations/Table'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { ROUTES } from '$/services/routes'
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

  const route = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commit.uuid })
    .documents.detail({ uuid: document.documentUuid })
    .evaluations.detail(evaluation.id).root

  if (evaluation.metadataType === EvaluationMetadataType.Manual) {
    return `${route}?documentLogId=${result.documentLogId}`
  }

  return `${route}?resultUuid=${result.uuid}`
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
          <Text.H4M noWrap ellipsis>
            {evaluation.name}
          </Text.H4M>
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
          <div className={'w-full flex justify-center'}>
            <Link
              href={evaluationResultLink({ result, evaluation })}
              target='_blank'
            >
              <Button variant='link'>
                Check evaluation result
                <Icon name='externalLink' widthClass='w-4' heightClass='h-4' />
              </Button>
            </Link>
          </div>
        </li>
      ))}
    </ul>
  )
}
