import React from 'react'

import { Section } from '@react-email/components'
import ContainerLayout from '../../components/ContainerLayout'
import { createLink } from '../../routes'
import { Button } from '../../components/Button'
import { Text } from '../../components/Text'

type Props = {
  user: { name: string | null }
  token: string
}
export default function ExportReadyMail({ user, token }: Props) {
  return (
    <ContainerLayout previewText={`Export is ready to download.`}>
      <Text.H5>Hi {user.name},</Text.H5>
      <Text.H5>
        Your export is ready to download. Click the link below to download.
      </Text.H5>
      <Section className='mt-6'>
        <Button href={createLink(`api/exports/${token}?download=true`)}>
          Click here to download
        </Button>
      </Section>
    </ContainerLayout>
  )
}

ExportReadyMail.PreviewProps = {
  user: { name: 'Jon' },
  token: 'asdlfkjhasdflkjhdsaflkjh',
} satisfies Props
