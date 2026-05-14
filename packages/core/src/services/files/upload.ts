import slugify from '@sindresorhus/slugify'
import path from 'path'
import { isPromptLFile, PromptLFile, toPromptLFile } from 'promptl-ai'
import { type Workspace } from '../../schema/models/types/Workspace'
import { MAX_UPLOAD_SIZE_IN_MB } from '../../constants'
import { diskFactory, DiskWrapper } from '../../lib/disk'
import { BadRequestError, UnprocessableEntityError } from '../../lib/errors'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { Result, TypedResult } from '../../lib/Result'

const LATITUDE_FILE_SIGNED_URL_EXPIRES_IN = '15m'

export type LatitudeManagedPromptLFile = PromptLFile & {
  latitudeFileKey: string
}

function generateKey({
  filename,
  prefix,
  workspace,
}: {
  filename: string
  prefix?: string
  workspace?: Workspace
}) {
  let keyPrefix = prefix
  if (!keyPrefix && workspace) keyPrefix = `workspaces/${workspace.id}`
  if (!keyPrefix) keyPrefix = 'unknown'

  const keyUuid = generateUUIDIdentifier()

  const keyFilename = slugify(filename, { preserveCharacters: ['.'] })

  return encodeURI(`${keyPrefix}/files/${keyUuid}/${keyFilename}`)
}

function toLatitudeManagedPromptLFile({
  file,
  key,
  url,
}: {
  file: File
  key: string
  url: string
}): LatitudeManagedPromptLFile {
  return {
    ...toPromptLFile({ file, url }),
    latitudeFileKey: key,
  }
}

/**
 * Returns whether a PromptL file was uploaded to Latitude-managed private storage.
 */
export function isLatitudeManagedPromptLFile(
  value: unknown,
): value is LatitudeManagedPromptLFile {
  return (
    isPromptLFile(value) &&
    'latitudeFileKey' in value &&
    typeof value.latitudeFileKey === 'string' &&
    value.latitudeFileKey.length > 0
  )
}

/**
 * Replaces the stale URL of a Latitude-managed file with a fresh signed URL.
 */
export async function refreshLatitudeManagedPromptLFile(
  file: LatitudeManagedPromptLFile,
  disk: DiskWrapper = diskFactory('private'),
): Promise<LatitudeManagedPromptLFile> {
  const url = await disk.getSignedUrl(file.latitudeFileKey, {
    expiresIn: LATITUDE_FILE_SIGNED_URL_EXPIRES_IN,
  })

  return { ...file, url }
}

/**
 * Uploads a file to private storage and returns a PromptL file with a temporary URL.
 */
export async function uploadFile(
  {
    file,
    prefix,
    workspace,
  }: {
    file: File
    prefix?: string
    workspace?: Workspace
  },
  disk: DiskWrapper = diskFactory('private'),
): Promise<TypedResult<LatitudeManagedPromptLFile, Error>> {
  const key = generateKey({ filename: file.name, prefix, workspace })
  const extension = path.extname(file.name).toLowerCase()

  if (file.size === 0) {
    return Result.error(new BadRequestError(`File is empty`))
  }

  if (file.size > MAX_UPLOAD_SIZE_IN_MB) {
    return Result.error(new BadRequestError(`File too large`))
  }

  try {
    await disk.putFile(key, file).then((r) => r.unwrap())
    const url = await disk.getSignedUrl(key, {
      expiresIn: LATITUDE_FILE_SIGNED_URL_EXPIRES_IN,
    })

    return Result.ok(toLatitudeManagedPromptLFile({ file, key, url }))
  } catch (_error) {
    return Result.error(
      new UnprocessableEntityError(`Failed to upload ${extension} file`),
    )
  }
}
