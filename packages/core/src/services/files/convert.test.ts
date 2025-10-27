import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as constants from '../../constants'
import { convertFile } from './convert'
import { BadRequestError } from './../../lib/errors'
import { UnprocessableEntityError } from './../../lib/errors'

describe('convertFile', () => {
  const DOCUMENTS_PATH = join(__dirname, '../../tests/fixtures/files/documents')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetAllMocks()
    vi.restoreAllMocks()
  })

  it('not converts empty file', async () => {
    // @ts-ignore
    const file = new File([Buffer.from('')], 'file')

    await expect(
      convertFile(file).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError(`File is empty`))
  })

  it('not converts large file', async () => {
    vi.spyOn(constants, 'MAX_UPLOAD_SIZE_IN_MB', 'get').mockReturnValue(1)

    // @ts-ignore
    const file = new File([Buffer.from('Too large!')], 'file')

    await expect(
      convertFile(file).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError(`File too large`))
  })

  it('not converts unsupported file', async () => {
    const name = 'file.bin'
    const content = await readFile(join(DOCUMENTS_PATH, name))
    // @ts-ignore
    const file = new File([content], name)

    await expect(
      convertFile(file).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError(`Unsupported file type: .bin`))
  })

  it('not converts when file conversion fails', async () => {
    const name = 'file.docx'
    const content = await readFile(join(DOCUMENTS_PATH, name))
    // @ts-ignore
    const file = new File([content.slice(0, -(content.length / 2))], name)

    await expect(
      convertFile(file).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(`Failed to convert .docx file to text`, {}),
    )
  })

  it('converts supported files', async () => {
    const files = await readdir(DOCUMENTS_PATH)
    for (const name of files) {
      if (['file.bin'].includes(name)) continue

      const content = await readFile(join(DOCUMENTS_PATH, name))
      // @ts-ignore
      const file = new File([content], name)

      await expect(convertFile(file).then((r) => r.unwrap())).resolves.toEqual(
        'Hello World!\nThis is a new line!',
      )
    }
  })
})
