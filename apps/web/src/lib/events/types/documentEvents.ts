export interface DocumentEvents {
  ProviderOrModelChanged: {
    promptLoaded: boolean
    providerName?: string
    model?: string
  }
}
