import { ReactNode } from 'react'

export type ContainerLayoutProps = {
  children: ReactNode
  previewText: string
  title?: string
  footer?: ReactNode
}

export type NotificiationsLayoutProps = {
  currentWorkspace: { id: number; name: string }
}
