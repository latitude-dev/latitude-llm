import { env } from 'process'
import React from 'react'

import { User } from '@latitude-data/core/browser'
import { Link, Text } from '@react-email/components'

import Layout from '../_components/Layout'

type Props = {
  invited: User
  invitee: User
  invitationToken: string
}
export default function InvitationMail({
  invited,
  invitee,
  invitationToken,
}: Props) {
  return (
    <Layout title='Login' previewText='Log in with this magic link'>
      <Text>Hi {invited.name},</Text>
      <Text>
        {invitee.name} has invited you to join Latitude. Click the link below to
        log in.
      </Text>
      <Link
        href={createInvitationLink(invitationToken)}
        target='_blank'
        className='text-blue-500 font-medium text-normal mb-4 underline'
      >
        Click here to log in
      </Link>
    </Layout>
  )
}

const createInvitationLink = (token: string) => {
  return `${env.LATITUDE_URL}/invitations/${token}`
}

InvitationMail.PreviewProps = {
  invited: { name: 'Jon' },
  invitee: { name: 'Arya' },
  invitationToken: 'asdlfkjhasdflkjhdsaflkjh',
}
