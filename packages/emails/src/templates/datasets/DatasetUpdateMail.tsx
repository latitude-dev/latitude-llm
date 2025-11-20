import React from 'react'

import { Section } from '@react-email/components'
import { Button } from '../../components/Button'
import { Text } from '../../components/Text'
import ContainerLayout from '../../components/ContainerLayout'
import { createLink } from '../../routes'

type Props = {
  user: { name: string | null }
  dataset: { id: number; name: string }
}
export default function DatasetUpdateMail({ user, dataset }: Props) {
  return (
    <ContainerLayout previewText={`Dataset has been updated.`}>
      <Text.H5>Hi {user.name},</Text.H5>
      <Text.H5>
        The dataset {dataset.name} has been updated. Click the link below to
        preview it.
      </Text.H5>
      <Section className='mt-6'>
        <Button href={createLink(`datasets/${dataset.id}`)}>
          Preview dataset
        </Button>
      </Section>
    </ContainerLayout>
  )
}

DatasetUpdateMail.PreviewProps = {
  user: { name: 'Jon' },
  dataset: { id: 1, name: 'My Dataset' },
} satisfies Props
