import { env } from 'process'
import React from 'react'

import { Link, Text } from '@react-email/components'

import Layout from '../_components/Layout'
import { User } from '../../../browser'

type Props = {
  invitee: User
}
export default function InvitationMail({ invitee }: Props) {
  return (
    <Layout previewText={`You've been invited to join Latitude!`}>
      <Text>Hi!</Text>
      <Text>
        {invitee.name} has invited you to join Latitude. Click the link below to
        set up an account for free.
      </Text>
      <Link
        href={`${env.APP_URL}/setup`}
        target='_blank'
        className='text-blue-500 font-medium text-base mb-4 underline'
      >
        Click here to set up your account
      </Link>
    </Layout>
  )
}

InvitationMail.PreviewProps = {
  invitee: { name: 'Arya' },
}
