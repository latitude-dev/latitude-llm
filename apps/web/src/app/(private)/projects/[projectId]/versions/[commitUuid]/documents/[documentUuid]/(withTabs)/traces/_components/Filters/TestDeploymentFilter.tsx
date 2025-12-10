import { useCallback, useMemo } from 'react'
import { DeploymentTest } from '@latitude-data/core/schema/models/types/DeploymentTest'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useFilterButtonColor, FilterButton } from '$/components/FilterButton'

function TestDeploymentCheckbox({
  test,
  selectedTestIds,
  onSelectTests,
}: {
  test: DeploymentTest
  selectedTestIds: number[]
  onSelectTests: (selectedTestIds: number[]) => void
}) {
  const isSelected = useMemo(
    () => selectedTestIds.includes(test.id),
    [selectedTestIds, test],
  )

  const onSelect = useCallback(() => {
    onSelectTests(
      isSelected
        ? selectedTestIds.filter((id) => id !== test.id)
        : [...selectedTestIds, test.id],
    )
  }, [selectedTestIds, test, isSelected, onSelectTests])

  return (
    <Checkbox
      checked={isSelected}
      onClick={onSelect}
      label={
        <div className='flex flex-col gap-1'>
          <Text.H5 noWrap ellipsis>
            {test.testType === 'ab' ? 'A/B Test' : 'Shadow Test'}
          </Text.H5>
        </div>
      }
    />
  )
}

function TestDeploymentsList({
  tests,
  selectedTestIds,
  onSelectTests,
}: {
  tests: DeploymentTest[]
  selectedTestIds: number[]
  onSelectTests: (selectedTestIds: number[]) => void
}) {
  return (
    <div className='flex flex-col gap-2 w-full'>
      <Text.H5B>Test Deployments</Text.H5B>
      <ul className='flex flex-col gap-2 w-full'>
        {tests.map((test) => (
          <li key={test.id}>
            <TestDeploymentCheckbox
              test={test}
              selectedTestIds={selectedTestIds}
              onSelectTests={onSelectTests}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function TestDeploymentFilter({
  selectedTestIds,
  onSelectTests,
  isDefault,
  reset,
  disabled,
  tests,
}: {
  selectedTestIds: number[]
  onSelectTests: (selectedTestIds: number[]) => void
  isDefault: boolean
  reset: () => void
  disabled?: boolean
  tests: DeploymentTest[]
}) {
  const sortedTests = useMemo(
    () =>
      [...tests].sort((a, b) => {
        const aTime =
          a.createdAt instanceof Date
            ? a.createdAt.getTime()
            : a.createdAt
              ? new Date(a.createdAt).getTime()
              : 0
        const bTime =
          b.createdAt instanceof Date
            ? b.createdAt.getTime()
            : b.createdAt
              ? new Date(b.createdAt).getTime()
              : 0
        return bTime - aTime
      }),
    [tests],
  )

  const filterLabel = useMemo(() => {
    if (isDefault) return 'All tests'
    if (selectedTestIds.length === 0) return 'No tests selected'
    if (selectedTestIds.length > 1) {
      return `${selectedTestIds.length} tests`
    }
    const selectedTest = tests.find((test) => test.id === selectedTestIds[0])
    return selectedTest
      ? `${selectedTest.testType === 'ab' ? 'A/B' : 'Shadow'} Test`
      : '1 test'
  }, [isDefault, selectedTestIds, tests])

  const filterColor = useFilterButtonColor({
    isDefault,
    isSelected: selectedTestIds.length > 0,
  })

  return (
    <FilterButton
      label={filterLabel}
      color={filterColor.color}
      darkColor={filterColor.darkColor}
    >
      <div className='flex flex-row gap-4 w-full flex-nowrap justify-end'>
        <Button
          size='none'
          variant='link'
          onClick={reset}
          disabled={disabled || isDefault}
        >
          Reset
        </Button>
      </div>
      <div className='flex flex-col gap-4'>
        <TestDeploymentsList
          tests={sortedTests}
          selectedTestIds={selectedTestIds}
          onSelectTests={onSelectTests}
        />
      </div>
    </FilterButton>
  )
}
