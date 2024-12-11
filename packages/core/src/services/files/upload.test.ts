import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Workspace } from '../../browser'
import * as constants from '../../constants'
import { BadRequestError, Result, UnprocessableEntityError } from '../../lib'
import { diskFactory } from '../../lib/disk'
import * as factories from '../../tests/factories'

import * as convert from './convert'
import { uploadFile } from './upload'

describe('uploadFile', () => {
  const DOCUMENTS_PATH = join(__dirname, '../../tests/fixtures/files/documents')
  const IMAGES_PATH = join(__dirname, '../../tests/fixtures/files/images')
  const disk = diskFactory()
  let workspace: Workspace

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetAllMocks()
    vi.restoreAllMocks()

    const { workspace: w } = await factories.createWorkspace()
    workspace = w

    vi.spyOn(disk, 'putFile').mockResolvedValue(Result.ok(undefined))
  })

  it('not uploads empty file', async () => {
    const file = new File([Buffer.from('')], 'file')

    await expect(
      uploadFile(file, workspace, disk).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError(`File is empty`))
  })

  it('not uploads large file', async () => {
    vi.spyOn(constants, 'MAX_UPLOAD_SIZE_IN_MB', 'get').mockReturnValue(1)

    const file = new File([Buffer.from('Too large!')], 'file')

    await expect(
      uploadFile(file, workspace, disk).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError(`File too large`))
  })

  it('not uploads unsupported file', async () => {
    const name = 'file.bin'
    const content = await readFile(join(DOCUMENTS_PATH, name))
    const file = new File([content], name)

    await expect(
      uploadFile(file, workspace, disk).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError(`Unsupported file type: .bin`))
  })

  it('not uploads when disk upload fails', async () => {
    vi.spyOn(disk, 'putFile').mockResolvedValue(
      Result.error(new Error('Upload failed')),
    )

    const name = 'file.png'
    const content = await readFile(join(IMAGES_PATH, name))
    const file = new File([content], name)

    await expect(
      uploadFile(file, workspace, disk).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(`Failed to upload .png file`, {}),
    )
  })

  it('uploads supported image files', async () => {
    const convertFile = vi.spyOn(convert, 'convertFile')

    const files = await readdir(IMAGES_PATH)
    for (const name of files) {
      const content = await readFile(join(IMAGES_PATH, name))
      const file = new File([content], name)

      await expect(
        uploadFile(file, workspace, disk).then((r) => r.unwrap()),
      ).resolves.toContain(`/workspaces/${workspace.id}/files/${name}`)
      expect(convertFile).not.toHaveBeenCalled()
    }
  })

  it('uploads supported document files', async () => {
    const convertFile = vi.spyOn(convert, 'convertFile')

    const files = await readdir(DOCUMENTS_PATH)
    for (const name of files) {
      if (['file.bin'].includes(name)) continue

      const content = await readFile(join(DOCUMENTS_PATH, name))
      const file = new File([content], name)

      await expect(
        uploadFile(file, workspace, disk).then((r) => r.unwrap()),
      ).resolves.toContain(`/workspaces/${workspace.id}/files/${name}`)
      expect(convertFile).toHaveBeenCalledWith(file)
    }
  })
})
