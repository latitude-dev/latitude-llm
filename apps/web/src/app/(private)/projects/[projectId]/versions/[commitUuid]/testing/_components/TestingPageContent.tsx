'use client'

import { DeploymentTest } from '@latitude-data/core/schema/models/types/DeploymentTest'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useRouter } from 'next/navigation'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TestsList } from './TestsList'
import { BlankSlate } from '@latitude-data/web-ui/molecules/BlankSlate'

export function TestingPageContent({ tests }: { tests: DeploymentTest[] }) {
  const router = useRouter()

  const handleCreateTest = () => {
    // Navigate to new test page
    router.push('testing/new')
  }

  return (
    <div className='flex flex-col h-full w-full p-6 gap-6'>
      {/* Header */}
      <div className='flex flex-row items-center justify-between'>
        <div className='flex flex-col gap-1'>
          <Text.H4M>Completed</Text.H4M>
          <Text.H6 color='foregroundMuted'>Runs already finished</Text.H6>
        </div>
        <Button fancy onClick={handleCreateTest}>
          + New Test
        </Button>
      </div>

      {/* Tests List or Empty State */}
      <div className='flex-grow min-h-0'>
        {tests.length > 0 ? (
          <TestsList tests={tests} />
        ) : (
          <BlankSlate>
            <Text.H2>Create your first test</Text.H2>
            <Text.H4>
              Tests allow you to compare performance between multiple project
              version with real data
            </Text.H4>
            <Button fancy onClick={handleCreateTest}>
              Create Your First Test
            </Button>
          </BlankSlate>
        )}
      </div>
    </div>
  )
}
