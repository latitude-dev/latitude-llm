import path from 'path'
import { fileURLToPath } from 'url'

import { Latitude } from '@latitude-data/sdk'
import dotenv from 'dotenv'
import OpenAI from 'openai'

// Load environment variables first
dotenv.config()

// @ts-expect-error - tsconfig shenanigans
const __filename = fileURLToPath(import.meta.url)
export const __dirname = path.dirname(__filename)

export const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3005

// Initialize Latitude client
export const latitude = new Latitude(process.env.LATITUDE_API_KEY!, {
  projectId: 15,
})

// Add conversation history storage (in memory)
export const conversations = new Map<
  string,
  Array<OpenAI.Chat.ChatCompletionMessageParam>
>()

export const SYSTEM_PROMPT =
  'You are a professional meteorologist and weather forecaster with years of experience. Provide detailed, accurate weather information and forecasts in a clear, professional manner. When discussing weather patterns, include relevant meteorological terms and explanations while keeping the information accessible. If asked about weather in specific locations, you should always use the getWeather function to get current data before providing your analysis.'
