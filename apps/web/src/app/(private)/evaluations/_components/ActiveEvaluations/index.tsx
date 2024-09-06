import { TableBlankSlate, TableWithHeader } from '@latitude-data/web-ui'
import useEvaluations from '$/stores/evaluations'

import ActiveEvaluationsTable from './Table'

export default function ActiveEvaluations({
  onCreateEvaluation,
}: {
  onCreateEvaluation: () => void
}) {
  const { data: evaluations, isLoading } = useEvaluations()
  if (isLoading) return null

  return (
    <TableWithHeader
      title='Your evaluations'
      actions={
        <TableWithHeader.Button onClick={onCreateEvaluation}>
          Add evaluation
        </TableWithHeader.Button>
      }
      table={
        <>
          {evaluations?.length ? (
            <ActiveEvaluationsTable evaluations={evaluations} />
          ) : (
            <TableBlankSlate
              description='There are no evaluations yet. Create one to start reviewing your prompts.'
              link={
                <TableBlankSlate.Button onClick={onCreateEvaluation}>
                  Create your first evaluation
                </TableBlankSlate.Button>
              }
            />
          )}
        </>
      }
    />
  )
}
