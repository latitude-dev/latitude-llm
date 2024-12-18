import { Request, Response } from 'express'
import { generateText, jsonSchema } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { getWeather } from '../services/weather'
import { latitude } from '../instrumentation'
import { generateObject } from 'ai'

export async function handleVercelChat(req: Request, res: Response) {
  try {
    const { messages: incoming, conversationId = 'default' } = req.body
    const prompt = await latitude.prompts.get('weather-prompt')
    const { config, messages } = await latitude.prompts.render({
      prompt,
      parameters: {
        user_message: incoming[incoming.length - 1].text,
      },
    })

    const google = createGoogleGenerativeAI({
      apiKey: 'REDACTED',
    })

    const completion = await latitude.telemetry.span({}, () =>
      generateObject({
        model: openai('gpt-4o-mini'),
        //model: google('gemini-1.5-flash-latest'),
        // model: anthropic('claude-3-5-sonnet-latest'),
        max_tokens: 1000,
        // @ts-ignore
        messages,
        // @ts-ignore
        tools: config.tools.map((tool: any) => ({
          ...tool,
          parameters: jsonSchema(tool.parameters),
        })),
        experimental_telemetry: {
          isEnabled: true,
        },
        schema: jsonSchema({
          type: 'object',
          properties: {
            response: { type: 'string' },
          },
          required: ['response'],
        }),
      }),
    )

    const responseMessage = await completion.object
    return res.json({
      response: responseMessage.response,
      conversationId,
    })

    const toolcalls = Array.isArray(responseMessage.content)
      ? responseMessage.content.filter((c) => c.type === 'tool-call')
      : []

    // Handle tool calls
    if (toolcalls.length > 0) {
      const toolResults = await Promise.all(
        toolcalls.map(async (toolCall) => {
          const args = toolCall.args as { location: string }
          const weatherData = await getWeather(args.location)
          return {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                result: JSON.stringify(weatherData),
              },
            ],
          }
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
      const secondResponse = await generateText({
        model: openai('gpt-3.5-turbo'),
        // @ts-ignore
        messages: convo,
        experimental_telemetry: {
          isEnabled: true,
        },
      })

      const assistantResponse = (await secondResponse.response).messages[0]
      const finalResponse =
        typeof assistantResponse.content === 'string'
          ? assistantResponse.content
          : assistantResponse.content[0].text || 'No response generated'

      res.json({
        response: finalResponse,
        conversationId,
      })
    } else {
      // Handle regular response without tool calls
      const assistantResponse =
        typeof responseMessage.content === 'string'
          ? responseMessage.content
          : responseMessage.content[0].text || 'No response generated'

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
