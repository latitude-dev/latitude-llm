import { ResolvedMetadata } from '$/workers/readMetadata'

export interface DocumentEvents {
  PromptMetadataChanged: {
    promptLoaded: boolean
    metadata: ResolvedMetadata
  }
}
