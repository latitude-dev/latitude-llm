import React from 'react'
import { Section } from '@react-email/components'
import ContainerLayout from '../../components/ContainerLayout'
import { createLink } from '../../routes'
import { Button } from '../../components/Button'
import { Text } from '../../components/Text'

export default function MagicLinkMail({
  user,
  magicLinkToken,
  returnTo,
}: {
  user: string
  magicLinkToken: string
  returnTo?: string
}) {
  const goTo = returnTo ? `?returnTo=${returnTo}` : ''
  const magicLink = `magic-links/confirm/${magicLinkToken}${goTo}`
  return (
    <ContainerLayout title='Welcome' previewText='Log in with this magic link'>
      <Text.H4>Hi {user},</Text.H4>
      <Text.H4>Here's your magic link to access Latitude.</Text.H4>

      <Section className='mt-6'>
        <Button href={createLink(magicLink)}>Access Latitude</Button>
      </Section>
    </ContainerLayout>
  )
}

MagicLinkMail.PreviewProps = {
  user: 'Jon',
  magicLinkToken: 'asdlkjfhadslkfjhadslkfjhdaskljh',
}
