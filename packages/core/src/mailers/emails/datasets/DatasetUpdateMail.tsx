import { env } from 'process'
import React from 'react'

import { Link, Text } from '@react-email/components'

import ContainerLayout from '../_components/ContainerLayout'
import { Dataset } from '../../../schema/models/types/Dataset'
import { User } from '../../../schema/models/types/User'

type Props = {
  user: User
  dataset: Dataset
}
export default function DatasetUpdateMail({ user, dataset }: Props) {
  return (
    <ContainerLayout previewText={`Dataset has been updated.`}>
      <Text>Hi {user.name},</Text>
      <Text>
        The dataset {dataset.name} has been updated. Click the link below to
        preview it.
      </Text>
      <Link
        href={createDatasetLink(dataset)}
        target='_blank'
        className='text-blue-500 font-medium text-base mb-4 underline'
      >
        Preview dataset
      </Link>
    </ContainerLayout>
  )
}

const createDatasetLink = (dataset: Dataset) => {
  return `${env.APP_URL}/datasets/${dataset.id}`
}

DatasetUpdateMail.PreviewProps = {
  user: { name: 'Jon' },
  dataset: { id: 1, name: 'My Dataset' },
}
