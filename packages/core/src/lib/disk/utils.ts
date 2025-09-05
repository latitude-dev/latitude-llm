import { Readable } from 'stream'

export const generateUrl =
  (baseUrl: string, publicPath: string) => async (key: string) =>
    `${baseUrl}/${publicPath}/${key}`

export async function getReadableStreamFromFile(file: File) {
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const stream = new Readable()
  stream.push(buffer)
  stream.push(null)

  return stream
}
