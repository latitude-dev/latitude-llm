import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { SSEStreamingApi } from 'hono/streaming'

export async function pipeToStream(
  stream: SSEStreamingApi,
  readableStream: ReadableStream,
) {
  let id = 0
  for await (const value of streamToGenerator(readableStream)) {
    stream.writeSSE({
      id: String(id++),
      event: 'data',
      data: JSON.stringify(value),
    })
  }
}
