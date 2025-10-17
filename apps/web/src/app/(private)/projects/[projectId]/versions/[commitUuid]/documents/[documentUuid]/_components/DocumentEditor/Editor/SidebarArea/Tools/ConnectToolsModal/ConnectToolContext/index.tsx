import { createContext } from 'react'
import { IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'
import { App } from '@latitude-data/core/constants'

type IConnectToolContext = {
  onAdd: (integration: IntegrationDto) => void
  onConnect: (app: App) => void
}

export const ConnectToolContext = createContext<IConnectToolContext>({
  onAdd: (_integration: IntegrationDto) => {},
  onConnect: (_app: App) => {},
})
