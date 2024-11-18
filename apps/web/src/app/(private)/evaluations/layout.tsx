import { ReactNode } from 'react'

import { useMetatags } from '$/hooks/useMetatags'

export const metadata = useMetatags({
  title: 'Evaluations',
})

export default async function EvaluationsLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return <>{children}</>
}
