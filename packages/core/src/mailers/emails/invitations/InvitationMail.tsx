import { env } from 'process'
import React from 'react'

import { Link, Text } from '@react-email/components'

import Layout from '../_components/Layout'
import { User } from '../../../browser'

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
    <Layout previewText={`Join ${invitee.name}'s workspace.`}>
      <Text>Hi {invited.name},</Text>
      <Text>
        {invitee.name} has invited you to join their workspace in Latitude.
        Click the link below to log in.
      </Text>
      <Link
        href={createInvitationLink(invitationToken)}
        target='_blank'
        className='text-blue-500 font-medium text-base mb-4 underline'
      >
        Click here to log in
      </Link>
    </Layout>
  )
}

const createInvitationLink = (token: string) => {
  return `${env.APP_URL}/invitations/${token}`
}

InvitationMail.PreviewProps = {
  invited: { name: 'Jon' },
  invitee: { name: 'Arya' },
  invitationToken: 'asdlfkjhasdflkjhdsaflkjh',
}
