import { Button, Text } from '@latitude-data/web-ui'
import useEvaluations from '$/stores/evaluationsStore'

import EmptyActiveEvaluations from './Empty'
import ActiveEvaluationsTable from './Table'

export default function ActiveEvaluations({
  onCreateEvaluation,
}: {
  onCreateEvaluation: () => void
}) {
  const { data: evaluations } = useEvaluations()

  return (
    <div className='w-full flex flex-col gap-4'>
      <div className='w-full flex flex-row justify-between items-center'>
        <Text.H4M>Your evaluations</Text.H4M>
        <Button fancy variant='outline' onClick={onCreateEvaluation}>
          Add evaluation
        </Button>
      </div>
      {evaluations?.length ? (
        <ActiveEvaluationsTable evaluations={evaluations} />
      ) : (
        <EmptyActiveEvaluations onCreateEvaluation={onCreateEvaluation} />
      )}
    </div>
  )
}
