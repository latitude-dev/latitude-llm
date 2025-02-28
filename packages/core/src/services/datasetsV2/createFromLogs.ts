import path from 'path'
import { nanoid } from 'nanoid'

import slugify from '@sindresorhus/slugify'

import { DatasetV2, DocumentLog, User, Workspace } from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import {
  BadRequestError,
  databaseErrorCodes,
  Result,
  Transaction,
} from '../../lib'
import { diskFactory, DiskWrapper } from '../../lib/disk'
import { syncReadCsv } from '../../lib/readCsv'
import { datasetsV2 } from '../../schema'
import { DatabaseError } from 'pg'
import { buildColumn, HashAlgorithmFn } from './utils'
import { createDataset } from './create'
import { ExportedDocumentLogs } from '../documentLogs/buildDocumentLogRows'
import { DatasetsV2Repository } from '../../repositories'

async function findOrCreateDataset(
  {
    name,
    author,
    workspace,
  }: {
    name: string
    author: User
    workspace: Workspace
  },
  db = database,
) {
  const repo = new DatasetsV2Repository(workspace.id)
  const datasets = await repo.findByName(name)
  const dataset = datasets[0]
  if (dataset) return Result.ok(dataset)

  return createDataset(
    {
      author,
      workspace,
      data: { name, columns: [] },
    },
    db,
  )
}

export const createDatasetFromLogs = async (
  {
    author,
    workspace,
    data,
  }: {
    author: User
    workspace: Workspace
    data: {
      name: string
      documentLogIds: number[]
    }
  },
  db = database,
) => {
  const result = await findOrCreateDataset({ name: data.name, author, workspace }, db)
  if (result.error) return result

  const dataset = result.value

  // get log rows with buildDocumentLogRows
  // merge dataset columns with document log columns
  //
  // Transaction
  // Update dataset columns
  // Create new dataset rows
  return Result.ok(dataset)
}
