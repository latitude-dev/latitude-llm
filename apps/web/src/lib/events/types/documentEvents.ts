import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'

export interface DocumentEvents {
  PromptMetadataChanged: {
    promptLoaded: boolean
    config: LatitudePromptConfig
  }
}
