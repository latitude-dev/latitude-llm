import type { StorageDiskPort } from "@domain/shared"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const toBytes = (contents: string | Uint8Array): Uint8Array =>
  typeof contents === "string" ? encoder.encode(contents) : contents

const toReadableStream = (bytes: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })

const readAllBytes = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let totalLength = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    totalLength += value.length
  }

  const merged = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }

  return merged
}

export class FakeStorageDisk implements StorageDiskPort {
  readonly files = new Map<string, Uint8Array>()
  readonly signedUrlCalls: Array<{ key: string; expiresIn?: number }> = []

  putBytes(key: string, value: Uint8Array): void {
    this.files.set(key, value)
  }

  putText(key: string, value: string): void {
    this.files.set(key, encoder.encode(value))
  }

  async put(key: string, contents: string | Uint8Array): Promise<void> {
    this.files.set(key, toBytes(contents))
  }

  async putStream(key: string, contents: ReadableStream<Uint8Array>): Promise<void> {
    this.files.set(key, await readAllBytes(contents))
  }

  async get(key: string): Promise<string> {
    return decoder.decode(await this.getBytes(key))
  }

  async getBytes(key: string): Promise<Uint8Array> {
    const value = this.files.get(key)
    if (!value) throw new Error(`Missing file for key ${key}`)
    return value
  }

  async getStream(key: string): Promise<ReadableStream<Uint8Array>> {
    return toReadableStream(await this.getBytes(key))
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key)
  }

  async getSignedUrl(key: string, options?: { expiresIn?: number }): Promise<string> {
    if (options?.expiresIn === undefined) {
      this.signedUrlCalls.push({ key })
    } else {
      this.signedUrlCalls.push({ key, expiresIn: options.expiresIn })
    }

    return `https://download.test/${key}`
  }
}
