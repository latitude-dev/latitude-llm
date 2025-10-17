import { env } from 'process'
import React from 'react'

import { Link, Text } from '@react-email/components'

import ContainerLayout from '../_components/ContainerLayout'
import { type User } from '../../../schema/models/types/User'

type Props = {
  invitee: User
}
export default function InvitationMail({ invitee }: Props) {
  return (
    <ContainerLayout previewText={`You've been invited to join Latitude!`}>
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
    </ContainerLayout>
  )
}

InvitationMail.PreviewProps = {
  invitee: { name: 'Arya' },
}
