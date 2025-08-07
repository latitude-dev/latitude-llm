'use client'

import { use, useEffect } from 'react'

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

  useEffect(() => {
    setTimeout(() => execute({ token, returnTo }), 1000)
  }, [execute, returnTo, token])

  return (
    <FocusLayout
      header={
        <FocusHeader
          title='Redirecting...'
          description='In a few seconds you will be redirected to your workspace.'
        />
      }
    />
  )
}
