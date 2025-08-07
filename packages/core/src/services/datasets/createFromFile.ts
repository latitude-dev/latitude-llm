import slugify from '@sindresorhus/slugify'
import path from 'path'

import { User, Workspace } from '../../browser'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { diskFactory, DiskWrapper } from '../../lib/disk'
import { createDataset, getCsvAndBuildColumns } from './create'
import { HashAlgorithmFn, nanoidHashAlgorithm } from './utils'

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
  if (diskResult.error) return diskResult

  const resultColumns = await getCsvAndBuildColumns({
    file: data.file,
    csvDelimiter: data.csvDelimiter,
    hashAlgorithm,
  })

  if (resultColumns.error) return resultColumns

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
      if (result.error) return result

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
