'use client'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Select } from '@latitude-data/web-ui/atoms/Select'

interface StepTwoProps {
  availableCommits: Commit[]
  baselineCommitUuid: string | null
  challengerCommitUuid: string | null
  onBaselineChange: (uuid: string | undefined) => void
  onChallengerChange: (uuid: string | undefined) => void
}

export function StepTwo({
  availableCommits,
  baselineCommitUuid,
  challengerCommitUuid,
  onBaselineChange,
  onChallengerChange,
}: StepTwoProps) {
  const mergedCommits = availableCommits
    .filter((c) => c.mergedAt !== null)
    .sort((a, b) => {
      const aDate = new Date(a.mergedAt!).getTime()
      const bDate = new Date(b.mergedAt!).getTime()
      return bDate - aDate
    })
  const headCommit = mergedCommits[0]
  const challengers = availableCommits.filter((c) => !c.mergedAt)

  return (
    <div className='flex flex-col gap-6'>
      <div className='space-y-4'>
        <Select
          name='baseline'
          disabled
          label='Baseline (Control)'
          description='The current live version'
          value={baselineCommitUuid || headCommit?.uuid}
          onChange={onBaselineChange}
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
            value={challengerCommitUuid ?? undefined}
            onChange={onChallengerChange}
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
