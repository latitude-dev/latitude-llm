import React from 'react'

import { Section } from '@react-email/components'
import ContainerLayout from '../../components/ContainerLayout'
import { createLink } from '../../routes'
import { Button } from '../../components/Button'
import { Text } from '../../components/Text'

type Props = {
  user: { name: string | null }
  datasetId: number
  datasetName: string
}
export default function DatasetReadyMail({
  user,
  datasetId,
  datasetName,
}: Props) {
  return (
    <ContainerLayout previewText={`Your dataset "${datasetName}" is ready.`}>
      <Text.H5>Hi {user.name},</Text.H5>
      <Text.H5>
        Your dataset "{datasetName}" has been created from spans and is ready to
        use.
      </Text.H5>
      <Section className='mt-6'>
        <Button href={createLink(`datasets/${datasetId}`)}>
          Click here to view the dataset
        </Button>
      </Section>
    </ContainerLayout>
  )
}

DatasetReadyMail.PreviewProps = {
  user: { name: 'Jon' },
  datasetId: 123,
  datasetName: 'My Dataset',
} satisfies Props
