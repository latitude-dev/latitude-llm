import { describe, it, expect, beforeAll } from 'vitest'
import { createDatasetFromJson } from './createFromJson'
import { identityHashAlgorithm } from '../datasets/utils'
import * as factories from '../../tests/factories'
import type { CreateWorkspaceResult } from '../../tests/factories/workspaces'
import { DatasetRowsRepository } from '../../repositories'

const validJsonArray = JSON.stringify([
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 },
])
const invalidJson = '{ invalid json }'

let data: CreateWorkspaceResult
describe('createDatasetFromJson', () => {
  beforeAll(async () => {
    data = await factories.createWorkspace()
  })

  it('extracts headers and rows from valid JSON', async () => {
    const result = await createDatasetFromJson({
      author: data.userData,
      workspace: data.workspace,
      data: {
        name: 'Test Dataset',
        rows: validJsonArray,
      },
      hashAlgorithm: identityHashAlgorithm,
    })

    const scope = new DatasetRowsRepository(data.workspace.id)
    const rows = await scope.findByDatasetPaginated({
      datasetId: result.value!.id,
      page: '1',
      pageSize: '100',
    })

    expect(rows.map((r) => r.rowData)).toEqual([
      {
        name_identifier: 'Bob',
        age_identifier: 25,
      },
      {
        name_identifier: 'Alice',
        age_identifier: 30,
      },
    ])
    expect(result.value).toEqual(
      expect.objectContaining({
        name: 'Test Dataset',
        author: {
          id: data.userData.id,
          name: data.userData.name,
        },
        columns: [
          {
            identifier: 'name_identifier',
            name: 'name',
            role: 'parameter',
          },
          {
            identifier: 'age_identifier',
            name: 'age',
            role: 'parameter',
          },
        ],
      }),
    )
  })

  it('returns error for invalid JSON', async () => {
    const result = await createDatasetFromJson({
      author: data.userData,
      workspace: data.workspace,
      data: {
        name: 'Test Dataset',
        rows: invalidJson,
      },
      hashAlgorithm: identityHashAlgorithm,
    })
    expect(result.error).toBeTruthy()
    expect(result.error?.message).toBe('Invalid generated data: { invalid json } is not valid JSON')
  })
})
