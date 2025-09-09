import { ReactNode, useCallback, useMemo, useState } from 'react'

import { ClaimedReward, RewardType } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import Link from 'next/link'
import { ZodType } from 'zod'

import { Step } from './Step'

export type RewardConfig = {
  type: RewardType
  title: string
  referenceSchema: ZodType
  placeholder: string
  steps: Array<{
    title: ReactNode
    content?: ReactNode
    links?: Array<{ href: string; text: string }>
    input?: boolean
  }>
  buttonConfig?: {
    allowMultiple?: boolean
    claimLabel?: string
    alreadyClamedLabel?: string
  }
}

type RewardMenuBaseProps = {
  claimedRewardData: ClaimedReward | undefined
  claimReward: ({
    type,
    reference,
  }: {
    type: RewardType
    reference: string
    optimistic?: boolean
  }) => Promise<void>
  config: RewardConfig
}

export function RewardMenuBase({
  claimedRewardData,
  claimReward,
  config,
}: RewardMenuBaseProps) {
  const { type, referenceSchema, placeholder, steps } = config

  const [reference, setReference] = useState(claimedRewardData?.reference ?? '')
  const [inputError, setInputError] = useState<string>()
  const [claimedReferences, setClaimedReferences] = useState<string[]>([])

  const claimFn = useCallback(() => {
    if (claimedRewardData) return

    const referenceParsing = referenceSchema.safeParse(reference || undefined)
    if (referenceParsing.error) {
      setInputError(referenceParsing.error.issues.at(0)!.message)
      return
    }

    setInputError(undefined)
    setClaimedReferences((prev) => [...prev, reference])

    claimReward({
      type,
      reference,
      optimistic: !config.buttonConfig?.allowMultiple,
    })
  }, [claimReward, reference, claimedRewardData, referenceSchema, type, config])

  const isClaimed = useMemo(() => {
    if (!claimedRewardData) return false

    if (type === RewardType.Referral) {
      return claimedRewardData?.isValid === true
    }

    return claimedRewardData?.isValid !== false
  }, [claimedRewardData, type])

  const buttonDisabled = useMemo(() => {
    if (isClaimed) return true

    if (config.buttonConfig?.allowMultiple) {
      return claimedReferences.includes(reference)
    }

    return !!claimedRewardData
  }, [
    claimedReferences,
    claimedRewardData,
    config.buttonConfig?.allowMultiple,
    reference,
    isClaimed,
  ])

  return (
    <>
      <div className='flex flex-col  divide-y divide-dashed divide-border'>
        {steps.map((step, index) => (
          <Step number={index + 1} key={index}>
            <div className='flex flex-col'>
              <Text.H5B>{step.title}</Text.H5B>
              <Text.H5 color='foregroundMuted'>{step.content}</Text.H5>
              {step.links &&
                step.links.map((link, idx) => (
                  <Link href={link.href} key={idx}>
                    <Button
                      variant='link'
                      className='!p-0'
                      iconProps={{
                        name: 'externalLink',
                        placement: 'right',
                        color: 'accentForeground',
                        className: 'flex-shrink-0 stroke-[2.25]',
                      }}
                    >
                      <Text.H5B color='accentForeground'>{link.text}</Text.H5B>
                    </Button>
                  </Link>
                ))}
            </div>
            {step.input && (
              <>
                <Input
                  value={reference}
                  disabled={isClaimed}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={placeholder}
                  className={cn({ 'border-destructive': inputError })}
                />
                {!!inputError && (
                  <Text.H6 color='destructive'>{inputError}</Text.H6>
                )}
              </>
            )}
          </Step>
        ))}
      </div>
      <div className='flex w-full justify-end'>
        <Button
          fancy
          roundy
          disabled={buttonDisabled}
          onClick={claimFn}
          fullWidth
          variant='outline'
        >
          {buttonDisabled
            ? (config.buttonConfig?.alreadyClamedLabel ??
              'Reward already claimed')
            : (config.buttonConfig?.claimLabel ?? 'Mark as done')}
        </Button>
      </div>
    </>
  )
}
