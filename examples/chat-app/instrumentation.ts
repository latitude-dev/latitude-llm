import dotenv from 'dotenv'
import { Latitude } from '@latitude-data/sdk'
import { Anthropic } from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { VercelSpanProcessor } from '@latitude-data/telemetry-js'

// Load environment variables first
dotenv.config()

export const latitude = new Latitude(process.env.LATITUDE_API_KEY, {
  projectId: 21,
  telemetry: {
    disableBatch: true,
    processors: [VercelSpanProcessor],
    // modules: {
    //   // @ts-ignore
    //   openAI: OpenAI,
    //   // @ts-ignore
    //   anthropic: Anthropic,
    // },
  },
})
