import { Link, Text } from '@react-email/components'

import Layout from '../_components/Layout'

// TODO

export default function SuggestionMail({
  user,
  document,
  evaluation,
  suggestion,
  link,
}: {
  user: string
  document: string
  evaluation: string
  suggestion: string
  link: string
}) {
  return (
    <Layout title='Login' previewText='Log in with this magic link'>
      <Text>Hi {user},</Text>
      <Text>
        We have generated a suggestion for {document} to improve {evaluation}.
      </Text>
      <Text>{suggestion}</Text>
      <Link
        href={link}
        target='_blank'
        className='text-blue-500 font-medium text-base mb-4'
      >
        Click here to see the suggestion
      </Link>
    </Layout>
  )
}

SuggestionMail.PreviewProps = {
  user: 'Alex',
  document: 'PR Reviewer',
  evaluation: 'Pedanticness',
  suggestion: 'Increased the use of the word "nit" to improve pedanticness.',
  link: 'https://example.com',
}
