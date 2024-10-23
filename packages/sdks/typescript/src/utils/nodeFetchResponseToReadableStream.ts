import { Readable } from 'stream'

import { ApiErrorCodes, LatitudeApiError } from '$sdk/utils/errors'

export function nodeFetchResponseToReadableStream(
  nodeStream: Readable,
  onError?: (err: LatitudeApiError) => void,
) {
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
       * The 'end' event is emitted when there is no more data to be consumed from the stream.
       * The 'end' event will not be emitted unless the data is completely consumed.
       * This can be accomplished by switching the stream into flowing mode, or by calling stream.read() repeatedly until all data has been consumed.
       */
      nodeStream.on('end', () => {
        controller.close()
      })

      /**
       * The 'close' event is emitted when the stream and any of its
       * underlying resources (a file descriptor, for example) have been closed.
       * The event indicates that no more events will be emitted, and no further computation will occur.
       *
       * A Readable stream will always emit the 'close' event if it is created with the emitClose option.
       */
      nodeStream.on('close', () => {
        // Optionally handle the case when the stream closes unexpectedly
        if (!nodeStream.readableEnded) {
          controller.close()
        }
      })

      /**
       * The 'error' event may be emitted by a Readable implementation at any time.
       * Typically, this may occur if the underlying stream is unable to generate data due to
       * an underlying internal failure, or when a stream implementation attempts to push an invalid chunk of data.
       */
      nodeStream.on('error', (err) => {
        try {
          controller.error(err)
        } catch (e) {
          // controller might be closed already
          if (onError) {
            const error = new LatitudeApiError({
              status: 500,
              message: err.message,
              serverResponse: err.stack ?? '',
              errorCode: ApiErrorCodes.InternalServerError,
            })
            onError(error)
          }
        }
      })
    },
  })
}
