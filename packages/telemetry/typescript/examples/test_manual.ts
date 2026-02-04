/**
 * Test Manual instrumentation against local Latitude instance.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_ID
 *
 * Install: npm install promptl-ai
 */

import { ContentType, Message, MessageRole, TextContent } from 'promptl-ai'
import { LatitudeTelemetry } from '../src'

const telemetry = new LatitudeTelemetry(process.env.LATITUDE_API_KEY!, {
  disableBatch: true,
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function simulateHttpRequest(
  url: string,
  method: string = 'POST',
  requestBody: Record<string, unknown> = {},
  responseBody: Record<string, unknown> = {},
  statusCode: number = 200,
): Promise<void> {
  const httpSpan = telemetry.span.http({
    request: {
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer sk-xxx-redacted',
        'X-Request-Id': `req-${Date.now()}`,
      },
      body: requestBody,
    },
  })

  await sleep(1 * 1000)

  httpSpan.end({
    response: {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': `res-${Date.now()}`,
        'X-RateLimit-Remaining': '99',
      },
      body: responseBody,
    },
  })
}

async function runFirstCompletion(): Promise<Message[]> {
  const input: Message[] = [
    {
      role: MessageRole.system,
      content: [
        {
          type: ContentType.text,
          text: 'You are an advanced AI assistant with vision capabilities, access to tools, and the ability to process files. You help users with complex multi-modal tasks.',
        },
      ],
    },
    {
      role: MessageRole.user,
      content: [
        {
          type: ContentType.text,
          text: 'Hello! I have an image of a document and a CSV file with some data. Can you analyze both and tell me what you see?',
        },
        {
          type: ContentType.image,
          image:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        },
        {
          type: ContentType.file,
          file: 'data:text/csv;base64,bmFtZSxhZ2UsY2l0eQpBbGljZSwzMCxOZXcgWW9yawpCb2IsMjUsU2FuIEZyYW5jaXNjbwpDaGFybGllLDM1LExvcyBBbmdlbGVz',
          mimeType: 'text/csv',
        },
      ],
    },
  ]

  const output: Message[] = [
    {
      role: MessageRole.assistant,
      content: [
        {
          type: ContentType.text,
          text: 'I can see both the image and the CSV file. Let me analyze them for you.\n\nThe image appears to be a small placeholder or test image (1x1 pixel).\n\nFor the CSV file, let me use a tool to parse and analyze the data properly.',
        },
        {
          type: ContentType.toolCall,
          toolCallId: 'call_parse_csv_001',
          toolName: 'parse_csv',
          toolArguments: {
            data: 'name,age,city\nAlice,30,New York\nBob,25,San Francisco\nCharlie,35,Los Angeles',
            includeStatistics: true,
          },
        },
        {
          type: ContentType.toolCall,
          toolCallId: 'call_get_weather_002',
          toolName: 'get_weather',
          toolArguments: {
            cities: ['New York', 'San Francisco', 'Los Angeles'],
          },
        },
      ],
    },
  ]

  const completionSpan = telemetry.span.completion({
    name: 'Initial Analysis Request',
    provider: 'openai',
    model: 'gpt-4-vision-preview',
    configuration: {
      temperature: 0.7,
      maxTokens: 2048,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
    },
    input,
  })

  await telemetry.context.with(completionSpan.context, async () => {
    await simulateHttpRequest(
      'https://api.openai.com/v1/chat/completions',
      'POST',
      {
        model: 'gpt-4-vision-preview',
        messages: input,
        temperature: 0.7,
        max_tokens: 2048,
      },
      {
        id: 'chatcmpl-abc123',
        object: 'chat.completion',
        model: 'gpt-4-vision-preview',
        choices: [{ message: output[0], finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: 450, completion_tokens: 180 },
      },
    )
  })

  completionSpan.end({
    output,
    tokens: {
      prompt: 450,
      cached: 50,
      completion: 180,
      reasoning: 0,
    },
    finishReason: 'tool_calls',
  })

  return output
}

async function runToolExecutions(): Promise<Message[]> {
  const toolMessages: Message[] = []

  const csvToolSpan = telemetry.span.tool({
    name: 'parse_csv',
    call: {
      id: 'call_parse_csv_001',
      arguments: {
        data: 'name,age,city\nAlice,30,New York\nBob,25,San Francisco\nCharlie,35,Los Angeles',
        includeStatistics: true,
      },
    },
  })

  await sleep(500)

  const csvResult = {
    rows: 3,
    columns: ['name', 'age', 'city'],
    statistics: {
      averageAge: 30,
      cities: ['New York', 'San Francisco', 'Los Angeles'],
    },
    parsed: [
      { name: 'Alice', age: 30, city: 'New York' },
      { name: 'Bob', age: 25, city: 'San Francisco' },
      { name: 'Charlie', age: 35, city: 'Los Angeles' },
    ],
  }

  csvToolSpan.end({
    result: {
      value: csvResult,
      isError: false,
    },
  })

  toolMessages.push({
    role: MessageRole.tool,
    content: JSON.stringify(csvResult),
    toolCallId: 'call_parse_csv_001',
    toolName: 'parse_csv',
  } as unknown as Message)

  const weatherToolSpan = telemetry.span.tool({
    name: 'get_weather',
    call: {
      id: 'call_get_weather_002',
      arguments: {
        cities: ['New York', 'San Francisco', 'Los Angeles'],
      },
    },
  })

  await sleep(750)

  const weatherError = new Error(
    'Weather API rate limit exceeded. Please try again in 60 seconds.',
  )

  weatherToolSpan.fail(weatherError)

  toolMessages.push({
    role: MessageRole.tool,
    content: JSON.stringify({
      error: weatherError.message,
      isError: true,
    }),
    toolCallId: 'call_get_weather_002',
    toolName: 'get_weather',
  } as unknown as Message)

  return toolMessages
}

async function runSecondCompletion(
  previousOutput: Message[],
  toolMessages: Message[],
): Promise<Message[]> {
  const input: Message[] = [
    {
      role: MessageRole.system,
      content: [
        {
          type: ContentType.text,
          text: 'You are an advanced AI assistant with vision capabilities, access to tools, and the ability to process files. You help users with complex multi-modal tasks.',
        },
      ],
    },
    {
      role: MessageRole.user,
      content: [
        {
          type: ContentType.text,
          text: 'Hello! I have an image of a document and a CSV file with some data. Can you analyze both and tell me what you see?',
        },
        {
          type: ContentType.image,
          image:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        },
        {
          type: ContentType.file,
          file: 'data:text/csv;base64,bmFtZSxhZ2UsY2l0eQpBbGljZSwzMCxOZXcgWW9yawpCb2IsMjUsU2FuIEZyYW5jaXNjbwpDaGFybGllLDM1LExvcyBBbmdlbGVz',
          mimeType: 'text/csv',
        },
      ],
    },
    ...previousOutput,
    ...toolMessages,
  ]

  const output: Message[] = [
    {
      role: MessageRole.assistant,
      content: [
        {
          type: ContentType.text,
          text: 'Here is my analysis of your data:\n\n## CSV Analysis\nThe CSV file contains information about 3 people:\n- **Alice** (30 years old) from New York\n- **Bob** (25 years old) from San Francisco\n- **Charlie** (35 years old) from Los Angeles\n\nThe average age is 30 years.\n\n## Weather Information\nUnfortunately, I was unable to fetch the weather information for the cities due to an API rate limit. Would you like me to try again later?\n\n## Image Analysis\nThe image you provided appears to be a very small test image (1x1 pixel). If you have a larger document image, please share it and I can provide a more detailed analysis.',
        },
      ],
    },
  ]

  const completionSpan = telemetry.span.completion({
    name: 'Analysis Response with Tool Results',
    provider: 'openai',
    model: 'gpt-4-vision-preview',
    configuration: {
      temperature: 0.7,
      maxTokens: 2048,
    },
    input,
  })

  await telemetry.context.with(completionSpan.context, async () => {
    await simulateHttpRequest(
      'https://api.openai.com/v1/chat/completions',
      'POST',
      {
        model: 'gpt-4-vision-preview',
        messages: input,
      },
      {
        id: 'chatcmpl-def456',
        choices: [{ message: output[0], finish_reason: 'stop' }],
        usage: { prompt_tokens: 720, completion_tokens: 245 },
      },
    )
  })

  completionSpan.end({
    output,
    tokens: {
      prompt: 720,
      cached: 100,
      completion: 245,
      reasoning: 0,
    },
    finishReason: 'stop',
  })

  return output
}

async function runThirdCompletionWithMultipleToolCalls(): Promise<Message[]> {
  const input: Message[] = [
    {
      role: MessageRole.user,
      content: [
        {
          type: ContentType.text,
          text: 'Can you search the web for the latest news about AI and also calculate some statistics for me?',
        },
      ],
    },
  ]

  const output: Message[] = [
    {
      role: MessageRole.assistant,
      content: [
        {
          type: ContentType.text,
          text: 'I will search for AI news and calculate the statistics you need.',
        },
        {
          type: ContentType.toolCall,
          toolCallId: 'call_web_search_003',
          toolName: 'web_search',
          toolArguments: {
            query: 'latest AI news January 2026',
            maxResults: 5,
          },
        },
        {
          type: ContentType.toolCall,
          toolCallId: 'call_calculator_004',
          toolName: 'calculator',
          toolArguments: {
            operation: 'statistics',
            values: [30, 25, 35, 28, 32, 29, 31],
          },
        },
        {
          type: ContentType.toolCall,
          toolCallId: 'call_generate_chart_005',
          toolName: 'generate_chart',
          toolArguments: {
            type: 'bar',
            data: {
              labels: ['Alice', 'Bob', 'Charlie'],
              values: [30, 25, 35],
            },
            title: 'Age Distribution',
          },
        },
      ],
    },
  ]

  const completionSpan = telemetry.span.completion({
    name: 'Multi-tool Request',
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
    configuration: {
      temperature: 0.5,
      maxTokens: 4096,
      topK: 40,
    },
    input,
  })

  await telemetry.context.with(completionSpan.context, async () => {
    await simulateHttpRequest(
      'https://api.anthropic.com/v1/messages',
      'POST',
      {
        model: 'claude-3-opus-20240229',
        messages: input,
        max_tokens: 4096,
      },
      {
        id: 'msg-xyz789',
        type: 'message',
        content: output[0].content,
        stop_reason: 'tool_use',
        usage: { input_tokens: 150, output_tokens: 320 },
      },
    )
  })

  completionSpan.end({
    output,
    tokens: {
      prompt: 150,
      cached: 0,
      completion: 320,
      reasoning: 0,
    },
    finishReason: 'tool_use',
  })

  return output
}

async function runMultipleToolExecutions(): Promise<Message[]> {
  const toolMessages: Message[] = []

  const webSearchSpan = telemetry.span.tool({
    name: 'web_search',
    call: {
      id: 'call_web_search_003',
      arguments: {
        query: 'latest AI news January 2026',
        maxResults: 5,
      },
    },
  })

  await sleep(350)

  const searchResults = {
    results: [
      {
        title: 'OpenAI announces GPT-5',
        url: 'https://example.com/gpt5',
        snippet: 'OpenAI has unveiled GPT-5 with unprecedented capabilities...',
      },
      {
        title: 'Google DeepMind achieves new milestone',
        url: 'https://example.com/deepmind',
        snippet: 'DeepMind researchers have made a breakthrough in...',
      },
      {
        title: 'AI regulation updates worldwide',
        url: 'https://example.com/regulation',
        snippet: 'New AI regulations are being implemented across...',
      },
    ],
  }

  webSearchSpan.end({
    result: {
      value: searchResults,
      isError: false,
    },
  })

  toolMessages.push({
    role: MessageRole.tool,
    content: JSON.stringify(searchResults),
    toolCallId: 'call_web_search_003',
    toolName: 'web_search',
  } as unknown as Message)

  const calculatorSpan = telemetry.span.tool({
    name: 'calculator',
    call: {
      id: 'call_calculator_004',
      arguments: {
        operation: 'statistics',
        values: [30, 25, 35, 28, 32, 29, 31],
      },
    },
  })

  await sleep(500)

  const statsResult = {
    mean: 30,
    median: 30,
    min: 25,
    max: 35,
    standardDeviation: 3.16,
    count: 7,
  }

  calculatorSpan.end({
    result: {
      value: statsResult,
      isError: false,
    },
  })

  toolMessages.push({
    role: MessageRole.tool,
    content: JSON.stringify(statsResult),
    toolCallId: 'call_calculator_004',
    toolName: 'calculator',
  } as unknown as Message)

  const chartSpan = telemetry.span.tool({
    name: 'generate_chart',
    call: {
      id: 'call_generate_chart_005',
      arguments: {
        type: 'bar',
        data: {
          labels: ['Alice', 'Bob', 'Charlie'],
          values: [30, 25, 35],
        },
        title: 'Age Distribution',
      },
    },
  })

  await sleep(750)

  const chartResult = {
    chartUrl: 'https://charts.example.com/chart-abc123.png',
    chartBase64:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9QzwAEjDAGQzQCAALvB/EtL4P1AAAAAElFTkSuQmCC',
    format: 'png',
    dimensions: { width: 800, height: 600 },
  }

  chartSpan.end({
    result: {
      value: chartResult,
      isError: false,
    },
  })

  toolMessages.push({
    role: MessageRole.tool,
    content: JSON.stringify(chartResult),
    toolCallId: 'call_generate_chart_005',
    toolName: 'generate_chart',
  } as unknown as Message)

  return toolMessages
}

async function runFinalCompletion(
  previousMessages: Message[],
  toolMessages: Message[],
): Promise<Message[]> {
  const input: Message[] = [...previousMessages, ...toolMessages]

  const output: Message[] = [
    {
      role: MessageRole.assistant,
      content: [
        {
          type: ContentType.text,
          text: '## Here are the results of your requests:\n\n### Latest AI News (January 2026)\n1. **OpenAI announces GPT-5** - OpenAI has unveiled GPT-5 with unprecedented capabilities\n2. **Google DeepMind achieves new milestone** - DeepMind researchers have made a breakthrough\n3. **AI regulation updates worldwide** - New AI regulations are being implemented across various countries\n\n### Statistics Calculation\nFor the values [30, 25, 35, 28, 32, 29, 31]:\n- **Mean**: 30\n- **Median**: 30\n- **Min**: 25\n- **Max**: 35\n- **Standard Deviation**: 3.16\n\n### Generated Chart\nI have generated a bar chart showing the age distribution:',
        },
        {
          type: ContentType.image,
          image:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9QzwAEjDAGQzQCAALvB/EtL4P1AAAAAElFTkSuQmCC',
        },
        {
          type: ContentType.text,
          text: '\n\nIs there anything else you would like me to help you with?',
        },
      ],
    },
  ]

  const completionSpan = telemetry.span.completion({
    name: 'Final Summary Response',
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
    configuration: {
      temperature: 0.5,
      maxTokens: 4096,
    },
    input,
  })

  await telemetry.context.with(completionSpan.context, async () => {
    await simulateHttpRequest(
      'https://api.anthropic.com/v1/messages',
      'POST',
      {
        model: 'claude-3-opus-20240229',
        messages: input,
      },
      {
        id: 'msg-final123',
        type: 'message',
        content: output[0].content,
        stop_reason: 'end_turn',
        usage: { input_tokens: 980, output_tokens: 450 },
      },
    )
  })

  completionSpan.end({
    output,
    tokens: {
      prompt: 980,
      cached: 200,
      completion: 450,
      reasoning: 0,
    },
    finishReason: 'end_turn',
  })

  return output
}

async function runConversationWithAssistantFile(): Promise<Message[]> {
  const input: Message[] = [
    {
      role: MessageRole.user,
      content: [
        {
          type: ContentType.text,
          text: 'Can you generate a PDF report of all the analysis we did?',
        },
      ],
    },
  ]

  const output: Message[] = [
    {
      role: MessageRole.assistant,
      content: [
        {
          type: ContentType.text,
          text: 'I have generated a comprehensive PDF report with all the analysis results. Here it is:',
        },
        {
          type: ContentType.file,
          file: 'data:application/pdf;base64,JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvUmVzb3VyY2VzIDw8ID4+IC9NZWRpYUJveCBbMCAwIDYxMiA3OTJdID4+CmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA2OCAwMDAwMCBuIAowMDAwMDAwMTMxIDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMjQxCiUlRU9G',
          mimeType: 'application/pdf',
        },
        {
          type: ContentType.text,
          text: 'The report includes:\n- CSV data analysis\n- Age distribution chart\n- AI news summary\n- Statistical calculations\n\nYou can download and share this report.',
        },
      ],
    },
  ]

  const completionSpan = telemetry.span.completion({
    name: 'PDF Report Generation',
    provider: 'openai',
    model: 'gpt-4-turbo',
    configuration: {
      temperature: 0.3,
      maxTokens: 1024,
    },
    input,
  })

  await telemetry.context.with(completionSpan.context, async () => {
    await simulateHttpRequest(
      'https://api.openai.com/v1/chat/completions',
      'POST',
      {
        model: 'gpt-4-turbo',
        messages: input,
      },
      {
        id: 'chatcmpl-report789',
        choices: [{ message: output[0], finish_reason: 'stop' }],
        usage: { prompt_tokens: 85, completion_tokens: 180 },
      },
    )
  })

  completionSpan.end({
    output,
    tokens: {
      prompt: 85,
      cached: 0,
      completion: 180,
      reasoning: 0,
    },
    finishReason: 'stop',
  })

  return output
}

async function testComplexMultiTurnConversation(): Promise<string> {
  console.log('  Turn 1: Initial analysis request with image and file...')
  const turn1Output = await runFirstCompletion()

  console.log(
    '  Turn 2: Executing tools (CSV parsing success, weather API failure)...',
  )
  const turn2ToolMessages = await runToolExecutions()

  console.log('  Turn 3: Response with tool results...')
  await runSecondCompletion(turn1Output, turn2ToolMessages)

  console.log('  Turn 4: Multi-tool request (web search, calculator, chart)...')
  const turn4Output = await runThirdCompletionWithMultipleToolCalls()

  console.log('  Turn 5: Executing multiple tools...')
  const turn5ToolMessages = await runMultipleToolExecutions()

  console.log('  Turn 6: Final summary with image in response...')
  await runFinalCompletion(turn4Output, turn5ToolMessages)

  console.log('  Turn 7: PDF report generation with file in response...')
  const finalOutput = await runConversationWithAssistantFile()

  const finalContent = finalOutput[0]?.content
  if (Array.isArray(finalContent)) {
    const textContent = finalContent.find((c): c is TextContent => 'text' in c)
    return textContent?.text ?? 'Conversation completed successfully'
  }

  return 'Conversation completed successfully'
}

async function main() {
  console.log(
    'Testing Manual instrumentation with complex multi-turn conversation...',
  )
  console.log('\n')

  const result = await telemetry.capture(
    {
      projectId: parseInt(process.env.LATITUDE_PROJECT_ID!),
      path: 'test/manual',
    },
    testComplexMultiTurnConversation,
  )

  console.log('\n')
  console.log(`Final response: ${result.substring(0, 100)}...`)
  console.log('Check Latitude dashboard for trace at path: test/manual-complex')
}

main().catch(console.error)
