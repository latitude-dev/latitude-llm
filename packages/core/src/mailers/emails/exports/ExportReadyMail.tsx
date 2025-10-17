import { env } from 'process'
import React from 'react'

import { Link, Text } from '@react-email/components'

import ContainerLayout from '../_components/ContainerLayout'
import { type User } from '../../../schema/models/types/User'

type Props = {
  user: User
  token: string
}
export default function ExportReadyMail({ user, token }: Props) {
  return (
    <ContainerLayout previewText={`Export is ready to download.`}>
      <Text>Hi {user.name},</Text>
      <Text>
        Your export is ready to download. Click the link below to download.
      </Text>
      <Link
        href={createExportLink(token)}
        target='_blank'
        className='text-blue-500 font-medium text-base mb-4 underline'
      >
        Click here to download
      </Link>
    </ContainerLayout>
  )
}

const createExportLink = (token: string) => {
  return `${env.APP_URL}/api/exports/${token}?download=true`
}

ExportReadyMail.PreviewProps = {
  user: { name: 'Jon' },
  token: 'asdlfkjhasdflkjhdsaflkjh',
}
