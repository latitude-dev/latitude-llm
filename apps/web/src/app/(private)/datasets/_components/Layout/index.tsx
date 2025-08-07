import { ReactNode } from 'react'

import { AppTabs } from '$/app/(private)/AppTabs'
import { Container, ContainerSize } from '@latitude-data/web-ui/atoms/Container'

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
