import { Link, Text } from '@react-email/components'
import ContainerLayout from '../_components/ContainerLayout'

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
    <ContainerLayout
      title='Suggestion'
      previewText={`Suggestion for ${document}.`}
    >
      <Text>Hi {user},</Text>
      <Text>
        We have generated a suggestion for {document} to improve {evaluation}:
      </Text>
      <Text>{suggestion}</Text>
      <Link
        href={link}
        target='_blank'
        className='text-blue-500 font-medium text-base mb-4'
      >
        Click here to improve {document}
      </Link>
    </ContainerLayout>
  )
}

SuggestionMail.PreviewProps = {
  user: 'Alex',
  document: 'PR Reviewer',
  evaluation: 'Pedanticness',
  suggestion: 'Increased the use of the word "nit" to improve pedanticness.',
  link: 'https://example.com',
}
