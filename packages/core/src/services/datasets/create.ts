import path from 'path'

import slugify from '@sindresorhus/slugify'

import { SafeWorkspace, User } from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib'
import { DiskWrapper } from '../../lib/disk'

export const createDataset = async (
  {
    author: _,
    workspace,
    disk,
    data,
  }: {
    author: User
    workspace: SafeWorkspace
    data: {
      name: string
      file: File
    }
    disk: DiskWrapper
  },
  _db = database,
) => {
  const name = slugify(data.name)
  const extension = path.extname(data.file.name)
  const fileName = `workspaces/${workspace.id}/datasets/${name}${extension}`

  const diskResult = await disk.putFile(fileName, data.file)

  if (diskResult.error) return diskResult

  return Result.ok(true)
}
