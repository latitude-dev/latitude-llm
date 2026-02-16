import { gzip, gunzip } from 'zlib'
import { promisify } from 'util'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

const GZIP_MAGIC_BYTE_1 = 0x1f
const GZIP_MAGIC_BYTE_2 = 0x8b

export function isGzipped(data: Buffer): boolean {
  return (
    data.length >= 2 &&
    data[0] === GZIP_MAGIC_BYTE_1 &&
    data[1] === GZIP_MAGIC_BYTE_2
  )
}

export async function compressString(input: string): Promise<Buffer> {
  return gzipAsync(Buffer.from(input, 'utf-8'))
}

export async function decompressToString(data: Buffer): Promise<string> {
  if (!isGzipped(data)) return data.toString('utf-8')

  const decompressed = await gunzipAsync(data)
  return decompressed.toString('utf-8')
}
