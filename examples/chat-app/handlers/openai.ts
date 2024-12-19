import { latitude } from '../instrumentation'

import { Request, Response } from 'express'
import OpenAI from 'openai'

import { getWeather } from '../services/weather'
import { SYSTEM_PROMPT } from '../config'

// Initialize OpenAI client
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function handleChat(req: Request, res: Response) {
  try {
    const { messages: incoming, conversationId = 'default' } = req.body
    const messages = [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      ...incoming.map((message: { role: string; text: string }) => ({
        role: message.role,
        content: message.text,
      })),
    ]

    const completion = await latitude.telemetry.span(
      {
        prompt: {
          uuid: 'c65dafaf-78d4-49f5-a2df-c991c9683300',
          parameters: { user_message: incoming[incoming.length - 1].text },
        },
      },
      async () =>
        await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          max_tokens: 1000,
          // @ts-ignore
          messages,
          // @ts-ignore
          tools: [
            {
              type: 'function',
              function: {
                name: 'getWeather',
                description: 'Get the weather for a given location',
                parameters: {
                  type: 'object',
                  properties: {
                    location: {
                      type: 'string',
                      description: 'The location to get the weather for',
                    },
                  },
                  required: ['location'],
                },
              },
            },
          ],
        }),
    )

    const responseMessage = completion.choices[0].message

    // Handle tool calls
    if (responseMessage.tool_calls?.length > 0) {
      const toolResults = await Promise.all(
        responseMessage.tool_calls.map(async (toolCall) => {
          if (toolCall.function.name === 'getWeather') {
            const args = JSON.parse(toolCall.function.arguments)
            const weatherData = await getWeather(args.location)
            return {
              tool_call_id: toolCall.id,
              role: 'tool' as const,
              content: JSON.stringify(weatherData),
            }
          }
          return null
        }),
      )

      // Filter out null results and add tool responses to conversation
      const validToolResults = toolResults.filter(
        (result): result is NonNullable<typeof result> => result !== null,
      )

      const convo = [
        ...messages,
        {
          role: 'assistant',
          tool_calls: responseMessage.tool_calls,
          content: JSON.stringify(responseMessage.tool_calls),
        },
        ...validToolResults.map((result) => result),
      ]

      // Get final response with tool results
      const secondResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        // @ts-ignore
        messages: convo,
      })

      const assistantResponse =
        secondResponse.choices[0]?.message?.content || 'No response generated'

      res.json({
        response: assistantResponse,
        conversationId,
      })
    } else {
      // Handle regular response without tool calls
      const assistantResponse =
        responseMessage.content || 'No response generated'

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

export function handleClearChat(res: Response) {
  try {
    res.json({ success: true })
  } catch (error) {
    console.error('Error:', error)
    res
      .status(500)
      .json({ error: 'An error occurred while clearing the conversation' })
  }
}
