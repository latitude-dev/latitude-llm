'use client'

import { useState, useCallback } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Slider } from '@latitude-data/web-ui/atoms/Slider'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import useDeploymentTests from '$/stores/deploymentTests'
import type { CommitTestInfo } from '../ActiveCommitsList'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'

export function ConfigureTestModal({
  testInfo,
  isOpen,
  onOpenChange,
}: {
  testInfo: CommitTestInfo
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { project } = useCurrentProject()
  const { update, pause, resume, stop } = useDeploymentTests({
    projectId: project.id,
  })
  const [trafficPercentage, setTrafficPercentage] = useState(() => {
    if (!testInfo) return 0
    if (testInfo.type === 'ab') {
      // testInfo.trafficPercentage always contains the challenger's percentage
      // (for both baseline and challenger commits)
      return testInfo.trafficPercentage
    }
    // For shadow tests, use the actual traffic percentage
    return testInfo.trafficPercentage
  })

  const handleSubmit = useCallback(() => {
    if (!testInfo) return

    // trafficPercentage always represents the challenger's percentage for A/B tests
    // (or the shadow test percentage for shadow tests)
    update
      .execute({
        testUuid: testInfo.testUuid,
        trafficPercentage,
      })
      .then(() => {
        onOpenChange(false)
      })
  }, [testInfo, trafficPercentage, update, onOpenChange])

  const isAbTest = testInfo?.type === 'ab'
  const isBaseline = testInfo?.type === 'ab' && testInfo?.isBaseline
  const isPaused = testInfo?.status === 'paused'

  const handlePauseTest = useCallback(() => {
    if (testInfo?.testUuid) {
      pause.execute(testInfo.testUuid)
    }
  }, [testInfo, pause, onOpenChange])

  const handleResumeTest = useCallback(() => {
    if (testInfo?.testUuid) {
      resume.execute(testInfo.testUuid)
    }
  }, [testInfo, resume, onOpenChange])

  const handleStopTest = useCallback(() => {
    if (testInfo?.testUuid) {
      stop.execute(testInfo.testUuid)
    }
  }, [testInfo, stop])

  if (!testInfo) return null

  return (
    <Modal
      open={isOpen}
      onOpenChange={onOpenChange}
      size='large'
      dismissible
      title='Configure Test'
      description={
        isAbTest
          ? isBaseline
            ? 'Configure the traffic percentage for the challenger version'
            : 'Configure the traffic percentage for this version'
          : 'Configure the traffic percentage for the shadow test'
      }
      footer={
        <div className='flex flex-row items-center justify-between w-full'>
          <CloseTrigger />
          <div className='flex flex-row items-center gap-2'>
            {isPaused ? (
              <Tooltip
                asChild
                trigger={
                  <Button
                    fancy
                    iconProps={{ name: 'play', color: 'foregroundMuted' }}
                    variant='outline'
                    onClick={handleResumeTest}
                    disabled={resume.isPending}
                  />
                }
              >
                Resume test
              </Tooltip>
            ) : (
              <Tooltip
                asChild
                trigger={
                  <Button
                    fancy
                    iconProps={{ name: 'pause', color: 'foregroundMuted' }}
                    variant='outline'
                    onClick={handlePauseTest}
                    disabled={pause.isPending}
                  />
                }
              >
                Pause test
              </Tooltip>
            )}
            <Tooltip
              asChild
              trigger={
                <Button
                  fancy
                  iconProps={{ name: 'circleStop' }}
                  variant='destructive'
                  onClick={handleStopTest}
                  disabled={stop.isPending}
                />
              }
            >
              Stop test
            </Tooltip>
            <Button
              fancy
              variant='default'
              onClick={handleSubmit}
              isLoading={update.isPending}
            >
              Save Changes
            </Button>
          </div>
        </div>
      }
    >
      <div className='flex flex-col gap-y-4'>
        <FormWrapper>
          <div className='flex flex-col gap-y-4'>
            <div className='flex flex-col gap-y-2'>
              <Text.H5M>Traffic percentage</Text.H5M>
              <Text.H6 color='foregroundMuted'>
                {isAbTest
                  ? isBaseline
                    ? 'Percentage of traffic to route to the challenger version'
                    : 'Percentage of traffic to route to this version'
                  : 'Percentage of traffic to shadow test'}
              </Text.H6>
            </div>
            <div className='flex flex-row items-center gap-4 px-2'>
              <Text.H6
                color={
                  trafficPercentage === 0
                    ? 'accentForeground'
                    : 'foregroundMuted'
                }
              >
                0%
              </Text.H6>
              <div className='relative flex-grow min-w-0'>
                <Slider
                  showMiddleRange
                  min={0}
                  max={100}
                  step={1}
                  value={[trafficPercentage]}
                  onValueChange={(value) => setTrafficPercentage(value[0]!)}
                />
              </div>
              <Text.H6
                color={
                  trafficPercentage === 100
                    ? 'accentForeground'
                    : 'foregroundMuted'
                }
              >
                100%
              </Text.H6>
            </div>
            <div className='flex justify-center'>
              <Text.H4M color='accentForeground'>{trafficPercentage}%</Text.H4M>
            </div>
            {isAbTest && isBaseline && (
              <div className='flex justify-center'>
                <Text.H6 color='foregroundMuted'>
                  Baseline: {100 - trafficPercentage}%
                </Text.H6>
              </div>
            )}
          </div>
        </FormWrapper>
      </div>
    </Modal>
  )
}
