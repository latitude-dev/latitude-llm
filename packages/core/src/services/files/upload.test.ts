import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Workspace } from '../../schema/models/types/Workspace'
import * as constants from '../../constants'
import * as lib from '../../lib/generateUUID'
import { diskFactory } from '../../lib/disk'
import * as factories from '../../tests/factories'

import { uploadFile } from './upload'
import { isPromptLFile } from 'promptl-ai'
import { BadRequestError } from './../../lib/errors'
import { Result } from './../../lib/Result'
import { UnprocessableEntityError } from './../../lib/errors'

describe('uploadFile', () => {
  const DOCUMENTS_PATH = join(__dirname, '../../tests/fixtures/files/documents')
  const IMAGES_PATH = join(__dirname, '../../tests/fixtures/files/images')
  const AUDIO_PATH = join(__dirname, '../../tests/fixtures/files/audio')
  const disk = diskFactory()
  let workspace: Workspace

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetAllMocks()
    vi.restoreAllMocks()

    const { workspace: w } = await factories.createWorkspace()
    workspace = w

    vi.spyOn(disk, 'putFile').mockResolvedValue(Result.ok(undefined))
    // @ts-expect-error - v4 can now return an array buffer but by default it
    // returns a string so we can safely expect this
    vi.spyOn(lib, 'generateUUIDIdentifier').mockReturnValue('fake-uuid')
  })

  it('not uploads empty file', async () => {
    // @ts-ignore
    const file = new File([Buffer.from('')], 'file')
    const result = await uploadFile({ file, workspace }, disk)
    expect(result.ok).toBeFalsy()
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error!.message).toBe('File is empty')
  })

  it('not uploads large file', async () => {
    vi.spyOn(constants, 'MAX_UPLOAD_SIZE_IN_MB', 'get').mockReturnValue(1)

    // @ts-ignore
    const file = new File([Buffer.from('Too large!')], 'file')
    const result = await uploadFile({ file, workspace }, disk)
    expect(result.ok).toBeFalsy()
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error!.message).toBe('File too large')
  })

  it('not uploads when disk upload fails', async () => {
    vi.spyOn(disk, 'putFile').mockResolvedValue(
      Result.error(new Error('Upload failed')),
    )

    const name = 'file.png'
    const content = await readFile(join(IMAGES_PATH, name))
    // @ts-ignore
    const file = new File([content], name)
    const result = await uploadFile({ file, workspace }, disk)
    expect(result.ok).toBeFalsy()
    expect(result.error).toBeInstanceOf(UnprocessableEntityError)
    expect(result.error!.message).toBe('Failed to upload .png file')
  })

  it('uploads image files', async () => {
    const files = await readdir(IMAGES_PATH)
    for (const name of files) {
      const content = await readFile(join(IMAGES_PATH, name))
      // @ts-ignore
      const file = new File([content], name)
      const result = await uploadFile({ file, workspace }, disk)
      expect(result.ok).toBeTruthy()

      const uploadedFile = result.unwrap()
      expect(isPromptLFile(uploadedFile)).toBeTruthy()
      expect(uploadedFile.name).toBe(name)
      expect(uploadedFile.url).toContain(
        `/workspaces/${workspace.id}/files/fake-uuid/${name}`,
      )
    }
  })

  it('uploads document files', async () => {
    const files = await readdir(DOCUMENTS_PATH)
    for (const name of files) {
      const content = await readFile(join(DOCUMENTS_PATH, name))
      // @ts-ignore
      const file = new File([content], name)
      const result = await uploadFile({ file, workspace }, disk)
      expect(result.ok).toBeTruthy()

      const uploadedFile = result.unwrap()
      expect(isPromptLFile(uploadedFile)).toBeTruthy()
      expect(uploadedFile.name).toBe(name)
      expect(uploadedFile.url).toContain(
        `/workspaces/${workspace.id}/files/fake-uuid/${name}`,
      )
    }
  })

  it('uploads audio files', async () => {
    const files = await readdir(AUDIO_PATH)
    for (const name of files) {
      const content = await readFile(join(AUDIO_PATH, name))
      // @ts-ignore
      const file = new File([content], name)
      const result = await uploadFile({ file, workspace }, disk)
      expect(result.ok).toBeTruthy()

      const uploadedFile = result.unwrap()
      expect(isPromptLFile(uploadedFile)).toBeTruthy()
      expect(uploadedFile.name).toBe(name)
      expect(uploadedFile.url).toContain(
        `/workspaces/${workspace.id}/files/fake-uuid/${name}`,
      )
    }
  })

  it('it uploads files with a workspace prefix', async () => {
    const name = 'file.png'
    const content = await readFile(join(IMAGES_PATH, name))
    // @ts-ignore
    const file = new File([content], name)
    const result = await uploadFile({ file, workspace }, disk)
    expect(result.ok).toBeTruthy()

    const uploadedFile = result.unwrap()
    expect(isPromptLFile(uploadedFile)).toBeTruthy()
    expect(uploadedFile.name).toBe(name)
    expect(uploadedFile.url).toContain(
      `/workspaces/${workspace.id}/files/fake-uuid/${name}`,
    )
  })

  it('it uploads files with a custom prefix', async () => {
    const name = 'file.png'
    const content = await readFile(join(IMAGES_PATH, name))
    // @ts-ignore
    const file = new File([content], name)
    const result = await uploadFile({ file, prefix: 'custom' }, disk)
    expect(result.ok).toBeTruthy()

    const uploadedFile = result.unwrap()
    expect(isPromptLFile(uploadedFile)).toBeTruthy()
    expect(uploadedFile.name).toBe(name)
    expect(uploadedFile.url).toContain(`/custom/files/fake-uuid/${name}`)
  })

  it('it uploads files with an unknown prefix', async () => {
    const name = 'file.png'
    const content = await readFile(join(IMAGES_PATH, name))
    // @ts-ignore
    const file = new File([content], name)
    const result = await uploadFile({ file }, disk)
    expect(result.ok).toBeTruthy()

    const uploadedFile = result.unwrap()
    expect(isPromptLFile(uploadedFile)).toBeTruthy()
    expect(uploadedFile.name).toBe(name)
    expect(uploadedFile.url).toContain(`/unknown/files/fake-uuid/${name}`)
  })
})
