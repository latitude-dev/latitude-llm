import { ReactNode } from 'react'

import buildMetatags from '$/app/_lib/buildMetatags'

export const metadata = buildMetatags({
  title: 'Evaluations',
})

export default async function EvaluationsLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return <>{children}</>
}
