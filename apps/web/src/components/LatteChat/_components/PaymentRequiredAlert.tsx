'use client'

import { UpgradeLink } from '$/components/UpgradeLink'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export function PaymentRequiredAlert() {
  return (
    <div className='w-full bg-background flex flex-row items-center justify-between gap-2 rounded-2xl border-latte-widget border shadow-sm p-4'>
      <div className='flex flex-row items-center justify-center gap-2'>
        <span className='rounded-xl bg-latte-input border border-latte-widget/15 p-1.5'>
          <Icon
            name='alertCircle'
            color='latteInputForeground'
            size='large'
            className='shrink-0'
          />
        </span>
        <span className='flex flex-col'>
          <Text.H4 color='latteInputForeground' noWrap ellipsis>
            You ran out of credits.
          </Text.H4>
          <Text.H4 color='latteOutputForeground' noWrap ellipsis>
            Please, upgrade to continue using Latte.
          </Text.H4>
        </span>
      </div>
      <UpgradeLink
        buttonProps={{
          variant: 'latte',
          fancy: true,
          iconProps: {
            name: 'arrowUpRight',
            placement: 'right',
            size: 'normal',
            color: 'latteInputForeground',
            className: 'flex-shrink-0 -mt-px',
          },
          userSelect: false,
        }}
      />
    </div>
  )
}
