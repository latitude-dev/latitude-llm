'use client'
import { FormEvent, useCallback, useState } from 'react'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useClaimedPromocodes from '$/stores/claimedPromocodes'

export default function ClaimPromocodeModal() {
  const { claim, isClaiming } = useClaimedPromocodes()
  const [code, setCode] = useState('')

  const navigate = useNavigate()
  const onOpenChange = useCallback(
    (open: boolean) => !open && navigate.push(ROUTES.settings.root),
    [navigate],
  )
  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (isClaiming) return
      const [_, error] = await claim({ code })

      if (!error) onOpenChange(false)
    },
    [claim, isClaiming, code, onOpenChange],
  )

  return (
    <Modal
      dismissible
      open
      onOpenChange={onOpenChange}
      title='Claim Promocode'
      description='Enter your promocode to claim it.'
      footer={
        <>
          <CloseTrigger />
          <Button
            fancy
            form='createApiKeyForm'
            type='submit'
            disabled={isClaiming}
          >
            Claim
          </Button>
        </>
      }
    >
      <form id='createApiKeyForm' onSubmit={onSubmit}>
        <Input
          required
          type='text'
          name='code'
          label='Code'
          placeholder='EXAMPLE_PROMOCODE_HERE'
          value={code}
          onChange={(e) => setCode(e.currentTarget.value.toUpperCase())}
          disabled={isClaiming}
        />
      </form>
    </Modal>
  )
}
