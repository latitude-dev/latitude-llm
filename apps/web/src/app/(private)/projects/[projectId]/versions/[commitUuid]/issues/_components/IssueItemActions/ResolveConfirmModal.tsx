import { SerializedIssue } from '$/stores/issues'
import { EvaluationV2 } from '@latitude-data/core/constants'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useState } from 'react'

export function ResolveConfirmModal({
  open,
  onOpenChange,
  onConfirm,
  issue,
  evaluations,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (ignoreEvaluations: boolean) => void
  issue: SerializedIssue
  evaluations: EvaluationV2[]
}) {
  const [ignoreEvaluations, setIgnoreEvaluations] = useState(false)
  const hasEvaluations = evaluations.length > 0

  return (
    <ConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      dismissible
      title={`Resolve "${issue.title}"`}
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
            <Text.H5>Linked evaluations</Text.H5>
            <Text.H6 color='foregroundMuted'>
              The following{' '}
              {evaluations.length === 1 ? 'evaluation is' : 'evaluations are'}{' '}
              tracking this issue:
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
            label='Deactivate linked evaluations'
            description='Evaluations will be hidden from the project and will stop tracking and monitoring this issue on new traces. They will be reactivated if you unresolve the issue later.'
          />
        </div>
      )}
    </ConfirmModal>
  )
}
