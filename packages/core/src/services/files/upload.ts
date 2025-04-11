import slugify from '@sindresorhus/slugify'
import path from 'path'
import { diskFactory, DiskWrapper } from '../../lib/disk'
import { Workspace } from '../../browser'
import { MAX_UPLOAD_SIZE_IN_MB } from '../../constants'
import { PromptLFile, toPromptLFile } from 'promptl-ai'
import { BadRequestError } from './../../lib/errors'
import { generateUUIDIdentifier } from './../../lib/generateUUID'
import { Result } from './../../lib/Result'
import { TypedResult } from './../../lib/Result'
import { UnprocessableEntityError } from './../../lib/errors'

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
  disk: DiskWrapper = diskFactory('public'),
): Promise<TypedResult<PromptLFile, Error>> {
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
    // TODO: Use temporal signed URLs, with a (micro)service
    // acting as a reverse proxy refreshing the signed urls
    const url = await disk.getUrl(key)

    return Result.ok(toPromptLFile({ file, url }))
  } catch (error) {
    return Result.error(
      new UnprocessableEntityError(`Failed to upload ${extension} file`, {}),
    )
  }
}
