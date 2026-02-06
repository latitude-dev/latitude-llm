import { FormEvent, useState, useEffect } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Text } from '@latitude-data/web-ui/atoms/Text'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentTrialEndsAt: Date | null
  onConfirm: (trialEndsAt: Date | null) => Promise<void>
  isLoading: boolean
}

function formatDateForInput(date: Date | null): string {
  if (!date) return ''
  return date.toISOString().split('T')[0]!
}

export function ChangeTrialEndDateModal({
  open,
  onOpenChange,
  currentTrialEndsAt,
  onConfirm,
  isLoading,
}: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(
    formatDateForInput(currentTrialEndsAt),
  )

  useEffect(() => {
    if (open) {
      setSelectedDate(formatDateForInput(currentTrialEndsAt))
    }
  }, [open, currentTrialEndsAt])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trialEndsAt = selectedDate ? new Date(selectedDate) : null
    await onConfirm(trialEndsAt)
  }

  const handleClear = async () => {
    await onConfirm(null)
  }

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={onOpenChange}
      title='Change Trial End Date'
      description='Set or clear the trial end date for this workspace subscription.'
      footer={
        <>
          <CloseTrigger />
          <div className='flex flex-row gap-2'>
            {currentTrialEndsAt && (
              <Button
                variant='destructive'
                onClick={handleClear}
                disabled={isLoading}
                isLoading={isLoading}
              >
                Clear Trial
              </Button>
            )}
            <Button
              fancy
              form='changeTrialEndDateForm'
              type='submit'
              disabled={isLoading || !selectedDate}
              isLoading={isLoading}
            >
              Update Date
            </Button>
          </div>
        </>
      }
    >
      <form id='changeTrialEndDateForm' onSubmit={handleSubmit}>
        <FormWrapper>
          <Input
            label='Trial End Date'
            name='trialEndsAt'
            type='date'
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            description={
              currentTrialEndsAt
                ? `Current: ${currentTrialEndsAt.toLocaleDateString()}`
                : 'No trial end date set'
            }
          />
          <Text.H6 color='foregroundMuted'>
            Note: The trial will end at the start of the selected date (00:00
            UTC).
          </Text.H6>
        </FormWrapper>
      </form>
    </Modal>
  )
}
