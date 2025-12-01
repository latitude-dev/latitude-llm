import { useState } from 'react'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { EvaluationV2 } from '@latitude-data/core/constants'

export function ResolveConfirmModal({
  open,
  onOpenChange,
  onConfirm,
  evaluations,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (ignoreEvaluations: boolean) => void
  evaluations: EvaluationV2[]
}) {
  const [ignoreEvaluations, setIgnoreEvaluations] = useState(true)
  const hasEvaluations = evaluations.length > 0

  return (
    <ConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      dismissible
      title='Resolve issue'
      description='Are you sure you want to resolve this issue?'
      confirm={{
        label: 'Resolve',
        isConfirming: false,
      }}
      onConfirm={() => onConfirm(ignoreEvaluations)}
    >
      {hasEvaluations && (
        <div className='flex flex-col gap-y-4'>
          <div className='flex flex-col gap-y-2'>
            <Text.H5>Associated evaluations</Text.H5>
            <Text.H6 color='foregroundMuted'>
              The following {evaluations.length}{' '}
              {evaluations.length === 1 ? 'evaluation is' : 'evaluations are'}{' '}
              linked to this issue:
            </Text.H6>
            <ul className='list-disc list-inside pl-2'>
              {evaluations.map((evaluation) => (
                <li key={evaluation.uuid}>
                  <Text.H6 color='foreground'>{evaluation.name}</Text.H6>
                </li>
              ))}
            </ul>
          </div>
          <SwitchInput
            checked={ignoreEvaluations}
            onCheckedChange={setIgnoreEvaluations}
            label='Stop live evaluation for associated evaluations'
            description='Evaluations linked to this issue will stop running automatically on new logs and will dissapear from evaluation lists. If you unresolve the issue later they will be reactivated.'
          />
        </div>
      )}
    </ConfirmModal>
  )
}
