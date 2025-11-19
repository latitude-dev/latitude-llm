'use client'

import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import React, { useCallback, useMemo, useState } from 'react'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Popover } from '@latitude-data/web-ui/atoms/Popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@latitude-data/web-ui/atoms/Command'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { DoubleButton } from '@latitude-data/web-ui/molecules/DoubleButton'
import { EvaluationV2 } from '@latitude-data/constants/evaluations'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'

export function IssueEvaluation({ issue }: { issue: Issue }) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const {
    data: evaluations,
    isLoading: isLoadingEvaluations,
    updateEvaluation,
    isUpdatingEvaluation,
    //    isGeneratingEvaluationFromIssue,
    //    generateEvaluationFromIssue,
  } = useEvaluationsV2({
    project: project,
    commit: commit,
    document: {
      commitId: commit.id,
      documentUuid: issue.documentUuid,
    },
  })

  const evaluationsWithoutRequiredExpectedOutput = useMemo(
    () =>
      evaluations.filter(
        (e) =>
          !getEvaluationMetricSpecification(e).requiresExpectedOutput &&
          getEvaluationMetricSpecification(e).supportsLiveEvaluation,
      ),
    [evaluations],
  )

  const evaluationWithIssue = useMemo(
    () =>
      evaluationsWithoutRequiredExpectedOutput.find(
        (e) => e.issueId === issue.id,
      ),
    [evaluationsWithoutRequiredExpectedOutput, issue.id],
  )
  const [isSelectOpen, setIsSelectOpen] = useState(false)

  const setIssueForNewEvaluation = useCallback(
    (newEvaluationUuid: string) => {
      if (evaluationWithIssue) {
        updateEvaluation({
          evaluationUuid: evaluationWithIssue.uuid,
          issueId: null,
        })
      }
      if (newEvaluationUuid) {
        updateEvaluation({
          evaluationUuid: newEvaluationUuid,
          issueId: issue.id,
        })
      }
    },
    [evaluationWithIssue, issue.id, updateEvaluation],
  )

  if (isLoadingEvaluations) {
    return (
      <div className='grid grid-cols-2 gap-x-4 items-center'>
        <Text.H5 color='foregroundMuted'>Evaluation</Text.H5>
        <Skeleton className='w-full h-10' />
      </div>
    )
  }

  if (evaluationWithIssue) {
    return (
      <div className='grid grid-cols-2 gap-x-4 items-center'>
        <Text.H5 color='foregroundMuted'>Evaluation</Text.H5>
        <div>
          <SelectEvaluationDropdown
            evaluations={evaluationsWithoutRequiredExpectedOutput}
            evaluationWithIssue={evaluationWithIssue}
            isUpdatingEvaluation={isUpdatingEvaluation}
            //            isGeneratingEvaluationFromIssue={isGeneratingEvaluationFromIssue}
            //            generateEvaluationFromIssue={generateEvaluationFromIssue}
            setIssueForNewEvaluation={setIssueForNewEvaluation}
            //issueId={issue.id}
          />
        </div>
      </div>
    )
  }

  return (
    <div className='grid grid-cols-2 gap-x-4 items-center'>
      <Text.H5 color='foregroundMuted'>Evaluation</Text.H5>
      <Popover.Root open={isSelectOpen} onOpenChange={setIsSelectOpen}>
        <Popover.Trigger asChild>
          <div>
            <DoubleButton
              leftButton={{
                variant: 'primaryMuted',
                iconProps: {
                  name: 'wandSparkles',
                  color: 'primary',
                  placement: 'left',
                },
                // onClick: (e) => {
                //   e.stopPropagation()
                //   generateEvaluationFromIssue({ issueId: issue.id })
                // }, TODO(evaluation-generator): Uncomment this once we have a way to generate evaluations from issues
                disabled: true, // TODO(evaluation-generator): Remove this once we have a way to generate evaluations from issues
                // disabled: isGeneratingEvaluationFromIssue,
                // isLoading: isGeneratingEvaluationFromIssue,
              }}
              leftButtonText='Generate'
              rightButton={{
                variant: 'ghost',
                iconProps: {
                  name: isSelectOpen ? 'chevronUp' : 'chevronDown',
                  color: isSelectOpen ? 'foreground' : 'foregroundMuted',
                  placement: 'right',
                },
                onClick: (e) => {
                  e.stopPropagation()
                  setIsSelectOpen(!isSelectOpen)
                },
                //disabled: isGeneratingEvaluationFromIssue,
                //isLoading: isGeneratingEvaluationFromIssue,
              }}
              rightButtonText='Select'
            />
          </div>
        </Popover.Trigger>
        <Popover.Content align='end' side='bottom' size='auto' className='p-0'>
          <SelectEvaluationDropdownContent
            evaluations={evaluationsWithoutRequiredExpectedOutput}
            evaluationWithIssue={evaluationWithIssue}
            // generateEvaluationFromIssue={generateEvaluationFromIssue}
            // issueId={issue.id}
            onSelect={(value) => {
              console.log('value', value)
              console.log('issueId', issue.id)
              setIssueForNewEvaluation(value)
              setIsSelectOpen(false)
            }}
          />
        </Popover.Content>
      </Popover.Root>
    </div>
  )
}

function SelectEvaluationDropdown({
  evaluations,
  evaluationWithIssue,
  isUpdatingEvaluation,
  //  isGeneratingEvaluationFromIssue,
  //  generateEvaluationFromIssue,
  setIssueForNewEvaluation,
  //  issueId,
}: {
  evaluations: EvaluationV2[]
  evaluationWithIssue: EvaluationV2 | undefined
  isUpdatingEvaluation: boolean
  //  isGeneratingEvaluationFromIssue: boolean
  //  generateEvaluationFromIssue: ({ issueId }: { issueId: number }) => void
  setIssueForNewEvaluation: (newEvaluationUuid: string) => void
  // issueId: number
}) {
  return (
    <Select
      badgeLabel
      align='end'
      searchable
      side='bottom'
      removable
      name='evaluation'
      options={evaluations.map((e) => ({
        label: e.name,
        value: e.uuid,
        icon: <Icon name={getEvaluationMetricSpecification(e).icon} />,
      }))}
      value={evaluationWithIssue?.uuid}
      disabled={isUpdatingEvaluation}
      loading={isUpdatingEvaluation}
      onChange={setIssueForNewEvaluation}
      // footerAction={{
      //   label: 'Generate new evaluation',
      //   icon: 'wandSparkles',
      //   onClick: () => undefined,
      // }} // TODO(evaluation-generator): Remove this once we have a way to generate evaluations from issues
    />
  )
}

function SelectEvaluationDropdownContent({
  evaluations,
  evaluationWithIssue,
  //  generateEvaluationFromIssue,
  //  issueId,
  onSelect,
}: {
  evaluations: EvaluationV2[]
  evaluationWithIssue: EvaluationV2 | undefined
  //  generateEvaluationFromIssue: ({ issueId }: { issueId: number }) => void
  //  issueId: number
  onSelect: (value: string) => void
}) {
  const metricSpec = evaluationWithIssue
    ? getEvaluationMetricSpecification(evaluationWithIssue!)
    : undefined

  const options = evaluations.map((e) => ({
    label: e.name,
    value: e.uuid,
    icon: metricSpec ? <Icon name={metricSpec.icon} /> : 'bot',
  }))

  // We currently do client side filtering of options as useEvaluationsV2 fetches all evaluations upfront, which is okay as we won't have many evaluations per document
  // However, if we have many evaluations per document, we should consider fetching evaluations on demand
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <>
      <Command>
        <CommandInput
          autoFocus
          placeholder='Search...'
          value={searchQuery}
          onValueChange={setSearchQuery}
        />
        <CommandList>
          <CommandEmpty>
            <Text.H6>No results found.</Text.H6>
          </CommandEmpty>
          <CommandGroup>
            {options
              .filter((option) => {
                const matchesSearch = option.label
                  .toLowerCase()
                  .includes(searchQuery.toLowerCase())
                const isSelected =
                  evaluationWithIssue &&
                  option.value === evaluationWithIssue.uuid
                return matchesSearch || isSelected
              })
              .map((option) => (
                <CommandItem
                  key={option.label}
                  value={option.label}
                  onSelect={() => {
                    onSelect(String(option.value) ?? '')
                    setSearchQuery('')
                  }}
                  className='cursor-pointer flex items-center gap-2'
                >
                  {option.icon && typeof option.icon === 'string' ? (
                    <Icon
                      name={option.icon as any}
                      size='small'
                      color='foregroundMuted'
                    />
                  ) : (
                    option.icon
                  )}
                  <Text.H6>{option.label}</Text.H6>
                </CommandItem>
              ))}
          </CommandGroup>
        </CommandList>
      </Command>
      {/* <div className='border-t border-border pt-1'>
        <button
          onClick={() => undefined}
          className={cn(
            'cursor-pointer flex items-center justify-center',
            'gap-1 py-1.5 px-2 w-full rounded-b-lg bg-muted hover:bg-accent',
          )}
        >
          <Icon
            name='wandSparkles'
            size='xnormal'
            color='foreground'
            className='flex-shrink-0'
          />
          <Text.H6>Generate new evaluation</Text.H6>
        </button>
      </div> // TODO(evaluation-generator): Remove this once we have a way to generate evaluations from issues */}
    </>
  )
}
