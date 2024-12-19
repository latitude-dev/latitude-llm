import dotenv from 'dotenv'
import { Latitude } from '@latitude-data/sdk'
import * as Anthropic from '@anthropic-ai/sdk'

// Load environment variables first
dotenv.config()

export const latitude = new Latitude('9d5a427b-f4db-42c4-ac03-41e30675bac2', {
  telemetry: {
    modules: {
      anthropic: Anthropic,
    },
  },
})
