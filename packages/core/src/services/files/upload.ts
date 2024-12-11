import slugify from '@sindresorhus/slugify'
import path from 'path'
import { diskFactory, DiskWrapper } from '../../lib/disk'

import {
  BadRequestError,
  Result,
  TypedResult,
  UnprocessableEntityError,
} from '../../lib'

import { Workspace } from '../../browser'
import { MAX_UPLOAD_SIZE_IN_MB, SUPPORTED_IMAGE_TYPES } from '../../constants'
import { convertFile } from './convert'

export async function uploadFile(
  file: File,
  workspace: Workspace,
  disk: DiskWrapper = diskFactory('public'),
): Promise<TypedResult<string, Error>> {
  const extension = path.extname(file.name).toLowerCase()
  const key = `workspaces/${workspace.id}/files/${slugify(file.name, { preserveCharacters: ['.'] })}`

  if (file.size === 0) {
    return Result.error(new BadRequestError(`File is empty`))
  }

  if (file.size > MAX_UPLOAD_SIZE_IN_MB) {
    return Result.error(new BadRequestError(`File too large`))
  }

  if (!SUPPORTED_IMAGE_TYPES.includes(extension)) {
    const converted = await convertFile(file)
    if (converted.error) return converted

    file = new File([converted.value], file.name)
  }

  try {
    await disk.putFile(key, file).then((r) => r.unwrap())
    const url = await disk.getSignedUrl(key, {
      expiresIn: undefined,
      contentDisposition: 'inline',
    })

    return Result.ok(url)
  } catch (error) {
    return Result.error(
      new UnprocessableEntityError(`Failed to upload ${extension} file`, {}),
    )
  }
}
