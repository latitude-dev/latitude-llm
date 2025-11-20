import React from 'react'
import { Section } from '@react-email/components'
import ContainerLayout from '../../components/ContainerLayout'
import { createLink } from '../../routes'
import { Button } from '../../components/Button'
import { Text } from '../../components/Text'

type Props = {
  invited: { name: string | null }
  invitee: { name: string | null }
  invitationToken: string
}
export default function InvitationMail({
  invited,
  invitee,
  invitationToken,
}: Props) {
  return (
    <ContainerLayout
      previewText={`Join ${invitee.name}'s workspace.`}
      footer={
        <Text.H6 color='foregroundMuted'>
          If you did not expect this invitation, you can safely ignore this
          email.
        </Text.H6>
      }
    >
      <Text.H5>Hi {invited.name},</Text.H5>
      <Text.H5>
        {invitee.name} has invited you to join their workspace in Latitude.
        Click the link below to log in.
      </Text.H5>
      <Section className='mt-6'>
        <Button href={createLink(`invitations/${invitationToken}`)}>
          Click here to log in
        </Button>
      </Section>
    </ContainerLayout>
  )
}

InvitationMail.PreviewProps = {
  invited: { name: 'Jon' },
  invitee: { name: 'Arya' },
  invitationToken: 'asdlfkjhasdflkjhdsaflkjh',
} satisfies Props
