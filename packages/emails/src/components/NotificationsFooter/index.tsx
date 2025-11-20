import React from 'react'

import { env } from '@latitude-data/env'
import { Link, Section } from '@react-email/components'
import { Text } from '../Text'
import { NotificiationsLayoutProps } from '../../types'

export default function NotificationsFooter({
  currentWorkspace,
}: NotificiationsLayoutProps) {
  const rootUrl = env.APP_URL
  const notificationSettingsUrl = `${rootUrl}/dashboard/notifications/${currentWorkspace.id}`
  return (
    <Section>
      <Text.H5M color='foregroundMuted'>
        Don't want to receive these emails?{' '}
      </Text.H5M>
      <Link href={notificationSettingsUrl}>
        <Text.H5 color='primary'>Manage your notifications</Text.H5>
      </Link>
    </Section>
  )
}
