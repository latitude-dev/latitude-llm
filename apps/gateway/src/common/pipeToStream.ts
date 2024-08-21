import { streamToGenerator } from '@latitude-data/core'
import { SSEStreamingApi } from 'hono/streaming'

export async function pipeToStream(
  stream: SSEStreamingApi,
  readableStream: ReadableStream,
) {
  let id = 0
  for await (const value of streamToGenerator(readableStream)) {
    stream.writeln(
      JSON.stringify({
        ...value,
        id: String(id++),
      }),
    )
  }
}
