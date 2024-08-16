export async function testConsumeStream(stream: ReadableStream) {
  const reader = stream.getReader()

  let done = false
  const events = []
  while (!done) {
    const { done: _done, value } = await reader.read()
    done = _done

    if (value) {
      events.push(value)
    }
  }

  return { done, value: events }
}
