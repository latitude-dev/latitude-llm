import React from 'react'

import { Link, Section } from '@react-email/components'
import { Text } from '../Text'
import { NotificiationsLayoutProps } from '../../types'
import { EMAIL_ROUTES } from '../../routes'

export default function NotificationsFooter({
  currentWorkspace,
}: NotificiationsLayoutProps) {
  return (
    <Section>
      <Text.H5M color='foregroundMuted'>
        Don't want to receive these emails?{' '}
      </Text.H5M>
      <Link href={EMAIL_ROUTES.notifications(currentWorkspace.id).root}>
        <Text.H5 color='primary'>Manage your notifications</Text.H5>
      </Link>
    </Section>
  )
}
