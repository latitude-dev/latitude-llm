import { createContext } from 'react'
import { AppDto } from '@latitude-data/core/constants'
import { IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'

type IConnectToolContext = {
  onAdd: (integration: IntegrationDto) => void
  onConnect: (app: AppDto) => void
}

export const ConnectToolContext = createContext<IConnectToolContext>({
  onAdd: (_integration: IntegrationDto) => {},
  onConnect: (_app: AppDto) => {},
})
