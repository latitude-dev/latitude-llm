import React from 'react'

import { Link, Text } from '@react-email/components'
import ContainerLayout from '../_components/ContainerLayout'

export default function IssueEscalatingMail({
  issueTitle,
  link,
}: {
  issueTitle: string
  link: string
}) {
  return (
    <ContainerLayout
      title='Issue Escalating'
      previewText={`Issue "${issueTitle}" is escalating.`}
    >
      <Text>Hello team</Text>
      <Text>
        We have detected that the issue <strong>"{issueTitle}"</strong> is
        escalating. This means the error frequency has increased significantly
        compared to the previous period.
      </Text>
      <Text>
        You can check more details and take action in the issues dashboard.
      </Text>
      <Link
        href={link}
        target='_blank'
        className='text-blue-500 font-medium text-base mb-4'
      >
        View issue in dashboard
      </Link>
    </ContainerLayout>
  )
}

IssueEscalatingMail.PreviewProps = {
  issueTitle: 'API timeout error in payment processing',
  link: 'https://example.com',
}
