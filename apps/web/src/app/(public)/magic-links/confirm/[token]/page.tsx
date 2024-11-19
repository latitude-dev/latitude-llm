'use client'

import { Usable, use, useEffect } from 'react'

import { FocusHeader } from '@latitude-data/web-ui'
import { confirmMagicLinkTokenAction } from '$/actions/magicLinkTokens/confirm'
import { FocusLayout } from '$/components/layouts'
import useLatitudeAction from '$/hooks/useLatitudeAction'

export default function ConfirmMagicLink({
  params,
}: {
  params: Usable<{ token: string }>
}) {
  const { token } = use(params)
  const { execute } = useLatitudeAction(confirmMagicLinkTokenAction, {
    onSuccess: () => {}, // We don't want the default toast message in this case
  })

  useEffect(() => {
    setTimeout(() => execute({ token }), 1000)
  }, [execute])

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
