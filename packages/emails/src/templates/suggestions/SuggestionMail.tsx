import React from 'react'

import { Section } from '@react-email/components'
import ContainerLayout from '../../components/ContainerLayout'
import { Button } from '../../components/Button'
import { Text } from '../../components/Text'

type Props = {
  user: string
  document: string
  evaluation: string
  suggestion: string
  link: string
}
export default function SuggestionMail({
  user,
  document,
  evaluation,
  suggestion,
  link,
}: Props) {
  return (
    <ContainerLayout
      title='Suggestion'
      previewText={`Suggestion for ${document}.`}
    >
      <Text.H5>Hi {user},</Text.H5>
      <Text.H5>
        We have generated a suggestion for {document} to improve {evaluation}:
      </Text.H5>
      <Section className='mt-6'>
        <Text.H5M>{suggestion}</Text.H5M>
      </Section>
      <Section className='mt-6'>
        <Button href={link}>Improve prompt</Button>
      </Section>
    </ContainerLayout>
  )
}

SuggestionMail.PreviewProps = {
  user: 'Alex',
  document: 'PR Reviewer',
  evaluation: 'Pedanticness',
  suggestion: 'Increased the use of the word "nit" to improve pedanticness.',
  link: 'https://example.com',
} satisfies Props
