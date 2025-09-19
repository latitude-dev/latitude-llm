import path from 'path'
import slugify from '@sindresorhus/slugify'

import { User, Workspace } from '../../browser'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import { diskFactory, DiskWrapper } from '../../lib/disk'
import { HashAlgorithmFn, nanoidHashAlgorithm } from './utils'
import { createDataset, getCsvAndBuildColumns } from './create'
import Transaction from '../../lib/Transaction'

export const createDatasetFromFile = async (
  {
    author,
    workspace,
    data,
    disk = diskFactory(),
    hashAlgorithm = nanoidHashAlgorithm,
  }: {
    author: User
    workspace: Workspace
    data: {
      name: string
      file: File
      csvDelimiter: string
    }
    disk?: DiskWrapper
    hashAlgorithm?: HashAlgorithmFn
  },
  transaction = new Transaction(),
) => {
  const name = slugify(data.name)
  const extension = path.extname(data.file.name)
  const key = `workspaces/${workspace.id}/datasets/${name}${extension}`

  const diskResult = await disk.putFile(key, data.file)
  if (!Result.isOk(diskResult)) return diskResult

  const resultColumns = await getCsvAndBuildColumns({
    file: data.file,
    csvDelimiter: data.csvDelimiter,
    hashAlgorithm,
  })

  if (!Result.isOk(resultColumns)) return resultColumns

  const columns = resultColumns.value

  return transaction.call(
    async () => {
      const result = await createDataset(
        {
          author,
          workspace,
          data: { name: data.name, columns },
        },
        transaction,
      )
      if (!Result.isOk(result)) return result

      const dataset = result.value

      return Result.ok({
        fileKey: key,
        dataset: {
          ...dataset,
          author: {
            id: author.id,
            name: author.name,
          },
        },
      })
    },
    ({ dataset }) =>
      publisher.publishLater({
        type: 'datasetUploaded',
        data: {
          workspaceId: workspace.id,
          datasetId: dataset.id,
          fileKey: key,
          csvDelimiter: data.csvDelimiter,
          userEmail: author.email,
        },
      }),
  )
}
