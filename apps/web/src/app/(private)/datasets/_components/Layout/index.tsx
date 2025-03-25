import { ReactNode } from 'react'

import { Container, ContainerSize } from '@latitude-data/web-ui'
import { AppTabs } from '$/app/(private)/AppTabs'

export default async function DatasetsList({
  size = 'xl',
  children,
}: {
  size?: ContainerSize
  children: ReactNode
}) {
  return (
    <Container limitMaxHeight size={size}>
      <AppTabs />
      {children}
    </Container>
  )
}
