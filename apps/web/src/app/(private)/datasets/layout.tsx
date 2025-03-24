import { ReactNode } from 'react'

import { Container } from '@latitude-data/web-ui'
import buildMetatags from '$/app/_lib/buildMetatags'
import { AppTabs } from '$/app/(private)/AppTabs'

export const metadata = buildMetatags({
  title: 'Datasets',
})

export default async function DatasetsList({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <Container limitMaxHeight>
      <AppTabs />
      {children}
    </Container>
  )
}
