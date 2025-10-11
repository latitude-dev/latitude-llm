import { create } from 'zustand'
import { IntegrationDto } from '@latitude-data/core/schema/types'

export type SidebarIntegration = {
  name: string
  tools: boolean | string[]
}
export type SidebarIntegrations = {
  [key: string]: SidebarIntegration
}
type SidebarEditorState = {
  integrations: SidebarIntegrations
  setIntegrations: (integrations: IntegrationDto) => void
}

export const useMetadataStore = create<SidebarEditorState>((set, _get) => ({
  integrations: {},
  setIntegrations: (integrations: IntegrationDto) =>
    set((state) => ({
      ...state,
      integrations: integrations as unknown as SidebarIntegrations,
    })),
}))

