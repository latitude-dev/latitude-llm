'use client'

import { use } from 'react'

import { useOnce } from '$/hooks/useMount'
import { confirmMagicLinkTokenAction } from '$/actions/magicLinkTokens/confirm'
import { FocusLayout } from '$/components/layouts'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { FocusHeader } from '@latitude-data/web-ui/molecules/FocusHeader'

export default function ConfirmMagicLink({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ returnTo?: string }>
}) {
  const { token } = use(params)
  const { returnTo } = use(searchParams)
  const { execute } = useLatitudeAction(confirmMagicLinkTokenAction, {
    onSuccess: () => {}, // We don't want the default toast message in this case
  })

  useOnce(() => {
    setTimeout(() => execute({ token, returnTo }), 1000)
  })

  return (
    <FocusLayout
      header={
        <FocusHeader
          title='You are in!'
          description='In a few seconds you will be redirected to your workspace.'
        />
      }
    />
  )
}
