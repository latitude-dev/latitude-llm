import { Button, Text } from '@latitude-data/web-ui'

export default function EmptyActiveEvaluations({
  onCreateEvaluation,
}: {
  onCreateEvaluation: () => void
}) {
  return (
    <div className='w-full min-h-[400px] bg-secondary flex flex-col justify-center items-center p-4 gap-6 rounded-2xl'>
      <div className='w-[400px] text-center'>
        <Text.H5 color='foregroundMuted'>
          There are no evaluations yet. Create one to start reviewing your
          prompts.
        </Text.H5>
      </div>
      <Button fancy onClick={onCreateEvaluation}>
        Create your first evaluation
      </Button>
    </div>
  )
}
