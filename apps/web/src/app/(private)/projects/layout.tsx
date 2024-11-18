import { ReactNode } from 'react'

import { useMetatags } from '$/hooks/useMetatags'

export const metadata = useMetatags({
  title: 'Projects',
})

export default async function ProjectsLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return <>{children}</>
}
