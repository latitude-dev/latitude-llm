import { ReactNode } from 'react'
import buildMetatags from '$/app/_lib/buildMetatags'
import { Metadata } from 'next'

export const metadata: Promise<Metadata> = buildMetatags({
  locationDescription: 'Prompt Experiments Page',
})

export default function ExperimentsLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
