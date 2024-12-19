import { Request, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'

import { getWeather } from '../services/weather'
import { Latitude } from '@latitude-data/sdk'
import { SYSTEM_PROMPT } from '../config'

const latitude = new Latitude('9d5a427b-f4db-42c4-ac03-41e30675bac2', {
  __internal: {
    gateway: {
      host: 'localhost',
      port: 8787,
      ssl: false,
    },
  },
  telemetry: {
    modules: {
      // @ts-ignore
      anthropic: Anthropic,
    },
  },
})
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function handleAnthropicChat(req: Request, res: Response) {
  try {
    const { messages: incoming, conversationId = 'default' } = req.body
    const messages = incoming.map((message) => ({
      role: message.role,
      content: message.text,
    }))

    const responseMessage = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      system: SYSTEM_PROMPT,
      max_tokens: 1000,
      messages,
      tools: [
        {
          name: 'getWeather',
          description: 'Get the weather for a given location',
          input_schema: {
            type: 'object',
            properties: {
              location: { type: 'string' },
            },
          },
        },
      ],
    })

    const toolCalls = responseMessage.content.filter(
      (content) => content.type === 'tool_use',
    )

    // Handle tool calls
    if (toolCalls?.length > 0) {
      const toolResults = await Promise.all(
        toolCalls.map(async (toolCall) => {
          if (toolCall.type === 'tool_use' && toolCall.name === 'getWeather') {
            const args = toolCall.input as { location: string }
            const weatherData = await getWeather(args.location)
            return {
              type: 'tool_result' as const,
              tool_use_id: toolCall.id,
              content: JSON.stringify(weatherData),
            }
          }
          return null
        }),
      )

      const validToolResults = toolResults.filter(
        (result): result is NonNullable<typeof result> => result !== null,
      )

      // Create conversation with tool results in a user message
      const convo = [
        ...messages,
        {
          role: 'assistant' as const,
          content: responseMessage.content,
        },
        {
          role: 'user' as const,
          content: validToolResults,
        },
      ]

      // Get final response with tool results
      const secondResponse = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 1000,
        messages: convo,
        tools: [
          {
            name: 'getWeather',
            description: 'Get the weather for a given location',
            input_schema: {
              type: 'object',
              properties: {
                location: { type: 'string' },
              },
            },
          },
        ],
      })

      // Extract text from the response
      const assistantResponse =
        secondResponse.content.find((block) => block.type === 'text')?.text ||
        'No response generated'

      res.json({
        response: assistantResponse,
        conversationId,
      })
    } else {
      // Handle regular response without tool calls
      const assistantResponse =
        responseMessage.content[0].text || 'No response generated'

      res.json({
        response: assistantResponse,
        conversationId,
      })
    }
  } catch (error) {
    console.error('Error:', error)
    res
      .status(500)
      .json({ error: 'An error occurred while processing your request' })
  }
}
