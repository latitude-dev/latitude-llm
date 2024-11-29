import { Request, Response } from 'express'
import OpenAI from 'openai'

import { getWeather } from '../services/weather'

import { SYSTEM_PROMPT } from '../config'
import { Latitude } from '@latitude-data/sdk'

const latitude = new Latitude(process.env.LATITUDE_API_KEY, {
  projectId: 21,
  telemetry: {
    modules: {
      // @ts-ignore
      openAI: OpenAI,
    },
  },
})

// Initialize OpenAI client
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function handleChat(req: Request, res: Response) {
  try {
    const { messages: incoming, conversationId = 'default' } = req.body
    const prompt = await latitude.prompts.get('weather-prompt')
    const { config, messages } = await latitude.prompts.render({
      prompt,
      parameters: {
        user_message: incoming[incoming.length - 1].text,
      },
    })

    const completion = await latitude.telemetry.span(
      {
        name: 'weather request',
        metadata: { foo: 'bar' },
        distinctId: 'jon@winterfell.com',
        prompt: 'weather-prompt',
      },
      async () =>
        await openai.chat.completions.create({
          model: config.model as string,
          max_tokens: 1000,
          // @ts-ignore
          messages,
          // @ts-ignore
          tools: config.tools.map((tool) => ({
            type: 'function',
            function: tool,
          })),
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
        responseMessage,
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
