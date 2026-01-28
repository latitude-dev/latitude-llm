'use client'

import { useGrantsAdmin } from '$/stores/admin/grants'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { FormEvent, useState } from 'react'
import { QuotaType } from '@latitude-data/core/constants'

export function IssueGrantModal({
  open,
  onOpenChange,
  onIssueGrant,
  isLoading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onIssueGrant: (
    data: Parameters<ReturnType<typeof useGrantsAdmin>['issueGrant']>[0],
  ) => Promise<void>
  isLoading: boolean
}) {
  const [grantType, setGrantType] = useState<QuotaType>(QuotaType.Credits)
  const [isUnlimited, setIsUnlimited] = useState(false)
  const [amount, setAmount] = useState<number>(0)
  const [periods, setPeriods] = useState<number>()

  const quotaTypeOptions = [
    { value: QuotaType.Seats, label: 'Seats' },
    { value: QuotaType.Runs, label: 'Runs' },
    { value: QuotaType.Credits, label: 'Credits' },
  ]

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!isUnlimited && (!amount || amount <= 0)) return

    await onIssueGrant({
      type: grantType,
      amount: isUnlimited ? ('unlimited' as const) : amount,
      periods: periods,
    })
    setAmount(0)
    setIsUnlimited(false)
    setPeriods(undefined)
    setGrantType(QuotaType.Credits)
  }

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={onOpenChange}
      title='Issue Grant'
      description='Create a new quota grant for this workspace.'
      footer={
        <>
          <CloseTrigger />
          <Button
            fancy
            form='issueGrantForm'
            type='submit'
            disabled={isLoading || (!isUnlimited && (!amount || amount <= 0))}
            isLoading={isLoading}
          >
            Issue Grant
          </Button>
        </>
      }
    >
      <form id='issueGrantForm' onSubmit={handleSubmit}>
        <FormWrapper>
          <Select
            label='Grant Type'
            name='grantType'
            options={quotaTypeOptions}
            value={grantType}
            onChange={(value) => setGrantType(value as QuotaType)}
            required
          />
          <div className='space-y-3'>
            <SwitchInput
              label='Unlimited'
              description='Grant unlimited access to this resource'
              checked={isUnlimited}
              onCheckedChange={setIsUnlimited}
            />
            {!isUnlimited && (
              <Input
                type='number'
                label='Amount'
                name='amount'
                placeholder='Enter grant amount'
                value={amount || ''}
                onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
                min='1'
                required
              />
            )}
          </div>
          <Input
            type='number'
            label='Billing Periods (Optional)'
            name='periods'
            placeholder='Enter number of billing periods'
            value={periods || ''}
            onChange={(e) => {
              const value = parseInt(e.target.value)
              setPeriods(value || undefined)
            }}
            min='1'
            description='Number of billing periods until grant expires. Leave empty for grants that never expire.'
          />
        </FormWrapper>
      </form>
    </Modal>
  )
}
