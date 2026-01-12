import { ReactNode } from 'react'
import { Metadata } from 'next'

import { Container } from '@latitude-data/web-ui/atoms/Container'
import buildMetatags from '$/app/_lib/buildMetatags'

export const metadata: Promise<Metadata> = buildMetatags({
  title: 'Choose Your Plan',
  locationDescription: 'Choose Your Plan',
})

export default async function ChoosePlanLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return <Container>{children}</Container>
}
