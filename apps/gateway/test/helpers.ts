export async function testConsumeStream(body: ReadableStream) {
  const responseStream = body as ReadableStream
  const reader = responseStream.getReader()

  let done = false
  let value
  while (!done) {
    const { done: _done, value: _value } = await reader.read()
    done = _done
    if (_value) value = new TextDecoder().decode(_value)
  }

  return { done, value }
}
