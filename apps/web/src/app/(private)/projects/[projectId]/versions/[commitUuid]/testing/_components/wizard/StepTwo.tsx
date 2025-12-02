'use client'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { WizardState } from '../CreateTestWizard'

interface StepTwoProps {
  state: WizardState
  onStateChange: (updates: Partial<WizardState>) => void
  availableCommits: Commit[]
  projectId: number
}

export function StepTwo({
  state,
  onStateChange,
  availableCommits,
}: StepTwoProps) {
  const mergedCommits = availableCommits.filter((c) => c.mergedAt !== null)
  const sortedMergedCommits = [...mergedCommits].sort((a, b) => {
    const aDate = new Date(a.mergedAt!).getTime()
    const bDate = new Date(b.mergedAt!).getTime()
    return bDate - aDate
  })
  const headCommit = sortedMergedCommits[0]
  const challengers = availableCommits.filter(
    (c) => c.uuid !== headCommit?.uuid,
  )

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-2'>
        <Text.H4M>Select Versions</Text.H4M>
        <Text.H5 color='foregroundMuted'>Choose which versions to test</Text.H5>
      </div>

      <div className='space-y-4'>
        <Select
          name='baseline'
          disabled
          label='Baseline (Control)'
          description='The current live version'
          value={headCommit?.uuid}
          options={
            headCommit
              ? [
                  {
                    label: `${headCommit.title || `v${headCommit.id}`} (Live)`,
                    value: headCommit.uuid,
                  },
                ]
              : []
          }
          placeholder='Select a baseline version'
          errors={
            !headCommit
              ? [
                  'You must publish at least one project version before creating a deployment test.',
                ]
              : undefined
          }
        />

        <div>
          <Select
            name='challenger'
            label='Challenger (test)'
            description='The optimized version to test'
            value={state.challengerCommitUuid}
            onChange={(value) =>
              onStateChange({ challengerCommitUuid: value as string })
            }
            options={challengers.map((commit) => ({
              label: commit.title || `v${commit.id}`,
              value: commit.uuid,
            }))}
            placeholder='Select a challenger version'
            searchable
            searchPlaceholder='Search versions...'
          />
        </div>
      </div>
    </div>
  )
}
