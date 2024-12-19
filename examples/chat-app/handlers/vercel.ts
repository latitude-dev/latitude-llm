import { Request, Response } from 'express'
import { generateText, jsonSchema } from 'ai'
import { openai } from '@ai-sdk/openai'
import { getWeather } from '../services/weather'
import { SYSTEM_PROMPT } from '../config'

export async function handleVercelChat(req: Request, res: Response) {
  const { messages: incoming, conversationId = 'default' } = req.body
  const messages = [
    {
      role: 'system',
      content: SYSTEM_PROMPT,
    },
    ...incoming.map((message: any) => ({
      role: message.role,
      content: message.text,
    })),
  ]

  const completion = await generateText({
    model: openai('gpt-4o-mini'),
    maxTokens: 1000,
    // @ts-ignore
    messages,
    // @ts-ignore
    tools: [
      {
        description: 'Get the weather for a location',
        execute: async (args: any) => {
          const weatherData = await getWeather(args.location)
          return JSON.stringify(weatherData)
        },
        parameters: jsonSchema({
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The location to get the weather for',
            },
          },
          required: ['location'],
        }),
      },
    ],
    experimental_telemetry: {
      isEnabled: true,
    },
  })

  const response = completion.text
  const toolResult = completion.toolResults[0]

  if (toolResult) {
    const completion = await generateText({
      model: openai('gpt-4o-mini'),
      messages: [
        {
          role: 'system',
          content:
            'Given the following temperature information, write a human readable summary of the weather in the specified location.',
        },
        {
          role: 'assistant',
          // @ts-ignore
          content: toolResult.result,
        },
      ],
      experimental_telemetry: { isEnabled: true },
    })

    return res.json({
      response: completion.text,
      conversationId,
    })
  }

  res.json({
    response,
    conversationId,
  })
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
