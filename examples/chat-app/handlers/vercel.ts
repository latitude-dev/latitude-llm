import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { Request, Response } from 'express'
import { z } from 'zod'

import { SYSTEM_PROMPT } from '../config'
import { getWeather } from '../services/weather'

export async function handleVercelChat(req: Request, res: Response) {
  try {
    const { message } = req.body
    if (!message) {
      return res.status(400).json({ error: 'Message is required' })
    }

    const messages = [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: message,
      },
    ]

    const completion = await generateText({
      model: openai('gpt-4o-mini'),
      // @ts-ignore
      messages,
      maxTokens: 150,
      tools: {
        getWeather: {
          description: 'Get the current weather for a specific location',
          parameters: z.object({
            location: z
              .string()
              .describe('The city or location to get weather for'),
          }),
          execute: async (args) => {
            const weatherData = await getWeather(args.location)
            return weatherData
          },
        },
      },
      experimental_telemetry: {
        isEnabled: true,
      },
    })

    let response
    if (completion.toolResults.length > 0) {
      response = await generateText({
        model: openai('gpt-4o-mini'),
        maxTokens: 150,
        messages: completion.response.messages,
        experimental_telemetry: {
          isEnabled: true,
        },
      })
    } else {
      response = completion
    }

    return res.json(response)
  } catch (error) {
    console.error('Error:', error)
    res
      .status(500)
      .json({ error: 'An error occurred while processing your request' })
  }
}

export function handleVercelClearChat(res: Response) {
  try {
    res.json({ success: true })
  } catch (error) {
    console.error('Error:', error)
    res
      .status(500)
      .json({ error: 'An error occurred while clearing the conversation' })
  }
}
