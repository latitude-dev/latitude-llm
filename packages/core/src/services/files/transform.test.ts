import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as constants from '../../constants'
import { BadRequestError } from '../../lib'

import { transformFile } from './transform'

describe('transformFile', () => {
  const FIXTURES_PATH = join(__dirname, '../../tests/fixtures/transform')

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('not transforms empty file', async () => {
    const file = new File([Buffer.from('')], 'file')

    await expect(
      transformFile(file).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError(`File is empty`))
  })

  it('not transforms large file', async () => {
    vi.spyOn(constants, 'MAX_UPLOAD_SIZE_IN_MB', 'get').mockReturnValue(1)

    const file = new File([Buffer.from('Too large!')], 'file')

    await expect(
      transformFile(file).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError(`File too large`))
  })

  it('not transforms unsupported file', async () => {
    const name = 'file.bin'
    const content = await readFile(join(FIXTURES_PATH, name))
    const file = new File([content], name)

    await expect(
      transformFile(file).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError(`Unsupported file type: .bin`))
  })

  it('transforms supported files', async () => {
    const files = await readdir(FIXTURES_PATH)
    for (const name of files) {
      if (['file.bin'].includes(name)) continue

      const content = await readFile(join(FIXTURES_PATH, name))
      const file = new File([content], name)

      await expect(
        transformFile(file).then((r) => r.unwrap()),
      ).resolves.toEqual('Hello World!\nThis is a new line!')
    }
  })
})
