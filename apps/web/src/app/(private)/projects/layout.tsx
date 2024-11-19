import { ReactNode } from 'react'

import buildMetatags from '$/app/_lib/buildMetatags'

export const metadata = buildMetatags({
  title: 'Projects',
})

export default async function ProjectsLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return <>{children}</>
}
