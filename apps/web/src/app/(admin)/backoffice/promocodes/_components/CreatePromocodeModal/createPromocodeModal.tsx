import { usePromocodes } from '$/stores/admin/promocodes'
import { QuotaType } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { useCallback, useEffect, useState } from 'react'

export default function CreatePromocodeModal({
  isCreatePromocodeModalOpen,
  setIsCreatePromocodeModalOpen,
  executeCreatePromocode,
}: {
  isCreatePromocodeModalOpen: boolean
  setIsCreatePromocodeModalOpen: (open: boolean) => void
  executeCreatePromocode: (
    data: Parameters<
      ReturnType<typeof usePromocodes>['executeCreatePromocode']
    >[0],
  ) => void
}) {
  const [code, setCode] = useState('')
  const [quotaType, setQuotaType] = useState<QuotaType>(QuotaType.Credits)
  const [amount, setAmount] = useState<number>(0)
  const [description, setDescription] = useState('')
  const quotaTypeOptions = [
    { label: 'Credits', value: QuotaType.Credits },
    { label: 'Runs', value: QuotaType.Runs },
    { label: 'Seats', value: QuotaType.Seats },
  ]

  const resetForm = useCallback(() => {
    setCode('')
    setQuotaType(QuotaType.Credits)
    setAmount(0)
    setDescription('')
  }, [])

  useEffect(() => {
    resetForm()
  }, [isCreatePromocodeModalOpen, resetForm])

  return (
    <Modal
      open={isCreatePromocodeModalOpen}
      onOpenChange={() => setIsCreatePromocodeModalOpen(false)}
      title='Create Promocode'
      description='Create a new promocode for the everyone to use!'
      footer={
        <>
          <CloseTrigger />
          <Button
            onClick={() => {
              executeCreatePromocode({
                code,
                quotaType,
                description,
                amount,
              })
            }}
            fancy
          >
            Create
          </Button>
        </>
      }
    >
      <FormWrapper>
        <Input
          label='Code'
          placeholder='PRODUCTHUNT-2025'
          value={code}
          onChange={(e) => setCode(e.currentTarget.value.toUpperCase())}
        />
        <Input
          label='Description'
          placeholder='Describe the promocode'
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
        />
        <Input
          label='Amount'
          placeholder='Amount of quota'
          type='number'
          value={amount}
          onChange={(e) => setAmount(parseInt(e.currentTarget.value))}
        />
        <Select
          label='Quota Type'
          name='quotaType'
          options={quotaTypeOptions}
          value={quotaType}
          onChange={(value) => setQuotaType(value as QuotaType)}
        />
      </FormWrapper>
    </Modal>
  )
}
