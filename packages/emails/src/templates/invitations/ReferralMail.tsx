import React from 'react'
import { Section } from '@react-email/components'
import ContainerLayout from '../../components/ContainerLayout'
import { createLink } from '../../routes'
import { Button } from '../../components/Button'
import { Text } from '../../components/Text'

type Props = { invitee: { name: string | null } }

export default function InvitationMail({ invitee }: Props) {
  return (
    <ContainerLayout previewText={`You've been invited to join Latitude!`}>
      <Text.H5>Hi!</Text.H5>
      <Text.H5>
        {invitee.name} has invited you to join Latitude. Click the link below to
        set up an account for free.
      </Text.H5>
      <Section className='mt-6'>
        <Button href={createLink('setup')}>Setup your account</Button>
      </Section>
    </ContainerLayout>
  )
}

InvitationMail.PreviewProps = {
  invitee: { name: 'Arya' },
}
