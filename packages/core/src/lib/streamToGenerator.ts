export async function* streamToGenerator<R>(stream: ReadableStream<R>) {
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    yield value
  }
}
