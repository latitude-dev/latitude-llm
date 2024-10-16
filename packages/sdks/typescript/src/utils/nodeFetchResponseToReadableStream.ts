import { Readable } from 'stream'

export function nodeFetchResponseToReadableStream(nodeStream: Readable) {
  return new ReadableStream({
    start(controller) {
      /**
       * chunk <Buffer> | <string> | <any> The chunk of data.
       *  For streams that are not operating in object mode, the chunk will be either a string or Buffer.
       *  For streams that are in object mode, the chunk can be any JavaScript value other than null.
       *
       * The 'data' event is emitted whenever the stream is relinquishing ownership of a chunk of data to a consumer.
       */
      nodeStream.on('data', (chunk: Buffer) => {
        controller.enqueue(chunk)
      })

      /**
       * The 'close' event is emitted when the stream and any of its underlying resources
       * (like a file descriptor) have been closed.
       * The event indicates that no more events will be emitted, and no further computation will occur.
       *
       * Other similar event is `end` event, which is emitted when there is no more data to be consumed from the stream.
       * But I think is safer to rely on `close` event, because it is emitted when the stream is closed,
       * and no more events will be emitted.
       */
      nodeStream.on('close', () => {
        controller.close()
      })

      /**
       * The 'error' event may be emitted by a Readable implementation at any time.
       * Typically, this may occur if the underlying stream is unable to generate data due to
       * an underlying internal failure, or when a stream implementation attempts to push an invalid chunk of data.
       */
      nodeStream.on('error', (err) => {
        controller.error(err)
      })
    },
  })
}
