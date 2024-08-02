export async function* streamToGenerator(stream: ReadableStream) {
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    yield value
  }
}
