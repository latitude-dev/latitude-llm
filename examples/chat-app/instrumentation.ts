import dotenv from 'dotenv'
import { Latitude } from '@latitude-data/sdk'
import { Anthropic } from '@anthropic-ai/sdk'
import OpenAI from 'openai'

// Load environment variables first
dotenv.config()

export const latitude = new Latitude(process.env.LATITUDE_API_KEY, {
  projectId: 21,
  telemetry: {
    disableBatch: true,
    //processors: [VercelSpanProcessor],
    modules: {
      // @ts-ignore
      openAI: OpenAI,
      // @ts-ignore
      anthropic: Anthropic,
    },
  },
})

const secondLatitudeProject = new Latitude(
  '9d5a427b-f4db-42c4-ac03-41e30675bac2',
  {
    projectId: 23,
    telemetry: {
      modules: {
        openAI: OpenAI, // Check the documentation to get a list of supported modules
      },
    },
  },
)
