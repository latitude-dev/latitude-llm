import { ListingHeader, TableBlankSlate } from '@latitude-data/web-ui'
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
    <div className='w-full flex flex-col gap-4'>
      <ListingHeader
        title='Your evaluations'
        actions={
          <ListingHeader.Button onClick={onCreateEvaluation}>
            Add evaluation
          </ListingHeader.Button>
        }
      />
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
    </div>
  )
}
