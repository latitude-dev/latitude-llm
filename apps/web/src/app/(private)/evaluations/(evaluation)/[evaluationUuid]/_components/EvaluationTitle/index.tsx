import { Evaluation } from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui'

export function EvaluationTitle({ evaluation }: { evaluation: Evaluation }) {
  return (
    <div className='flex flex-row items-center justify-between p-4 pb-0'>
      <Text.H4B>{evaluation.name}</Text.H4B>
    </div>
  )
}
