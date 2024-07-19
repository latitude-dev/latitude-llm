import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

const FAKE_RANDOM_ID = 'RANDOM_ID'

let list = [
  { path: 'things/doc1', doumentUuid: '1' },
  { path: 'things/doc2', doumentUuid: '2' },
  { path: 'things/other-things/doc3', doumentUuid: '3' },
  { path: 'something-else/doc4', doumentUuid: '4' },
]

describe('useTree', () => {
  it('should return a tree with children', async () => {
    const resultImport = await import('./index')
    const { useTree } = resultImport

    const { result } = renderHook(() =>
      useTree({
        documents: list,
        generateNodeId: ({ uuid }: { uuid?: string } = {}) => {
          if (uuid) return uuid

          return FAKE_RANDOM_ID
        },
      }),
    )
    expect(result.current.toJSON()).toEqual({
      id: FAKE_RANDOM_ID,
      doc: undefined,
      isRoot: true,
      name: 'root',
      children: [
        {
          id: FAKE_RANDOM_ID,
          doc: undefined,
          name: 'things',
          isRoot: false,
          children: [
            {
              id: '1',
              name: 'doc1',
              isRoot: false,
              doc: { path: 'things/doc1', doumentUuid: '1' },
              children: [],
            },
            {
              id: '2',
              name: 'doc2',
              isRoot: false,
              doc: { path: 'things/doc2', doumentUuid: '2' },
              children: [],
            },
            {
              id: FAKE_RANDOM_ID,
              isRoot: false,
              doc: undefined,
              name: 'other-things',
              children: [
                {
                  id: '3',
                  isRoot: false,
                  name: 'doc3',
                  doc: { path: 'things/other-things/doc3', doumentUuid: '3' },
                  children: [],
                },
              ],
            },
          ],
        },
        {
          id: FAKE_RANDOM_ID,
          isRoot: false,
          doc: undefined,
          name: 'something-else',
          children: [
            {
              id: '4',
              name: 'doc4',
              isRoot: false,
              doc: { path: 'something-else/doc4', doumentUuid: '4' },
              children: [],
            },
          ],
        },
      ],
    })
  })
})
