'use client'

import { useState, useCallback } from 'react'
import { RewardType } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'

export function ClaimRewardModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [reference, setReference] = useState('')

  return (
    <Modal
      open={isOpen}
      onOpenChange={setIsOpen}
      title={'Promocodes'}
      description={'Enter your referral code to claim your reward.'}
      dismissible
    >
      <div className='flex flex-col gap-4'>
        <div className='flex flex-col gap-2'>
          <Text.H5>Reference</Text.H5>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={'Enter your referral code'}
            className={cn({ 'border-destructive': false })}
          />
        </div>

        {isAlreadyClaimed && (
          <div className='p-3 bg-muted rounded-lg'>
            <Text.H6 color='foreground'>
              This reward has already been claimed.
            </Text.H6>
          </div>
        )}
      </div>
    </Modal>
  )
}
