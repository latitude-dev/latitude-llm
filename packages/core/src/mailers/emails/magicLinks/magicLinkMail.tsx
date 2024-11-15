import React from 'react'

import { env } from '@latitude-data/env'
import { Link, Text } from '@react-email/components'

import Layout from '../_components/Layout'

type Props = {
  user: string
  magicLinkToken: string
}

export default function MagicLinkMail({ user, magicLinkToken }: Props) {
  return (
    <Layout title='Login' previewText='Log in with this magic link'>
      <Text>Hi {user},</Text>
      <Text>
        Here's your magic link to access Latitude. Click the link below to log
        in.
      </Text>
      <Link
        href={createMagicLink(magicLinkToken)}
        target='_blank'
        className='text-blue-500 font-medium text-base mb-4'
      >
        Click here to log in
      </Link>
    </Layout>
  )
}

const createMagicLink = (token: string) => {
  return `${env.LATITUDE_URL}/magic-links/confirm/${token}`
}

MagicLinkMail.PreviewProps = {
  user: 'Jon',
  magicLinkToken: 'asdlkjfhadslkfjhadslkfjhdaskljh',
}
