import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Node, useTree } from './index'

const FAKE_RANDOM_ID = 'RANDOM_ID'

function fakeRandomId({ uuid }: { uuid?: string } = {}) {
  if (uuid) return uuid

  return FAKE_RANDOM_ID
}

function nodeToJson(node: Node): object {
  return {
    name: node.name,
    id: node.id,
    children: node.children.map(nodeToJson),
  }
}

let list = [
  { path: 'a_thing/doc1', doumentUuid: '1' },
  { path: 'a_thing/doc2', doumentUuid: '2' },
  { path: 'a_thing/other-things/doc3', doumentUuid: '3' },
  { path: 'z_thing/doc5', doumentUuid: '5' },
  { path: 'b_thing/doc4', doumentUuid: '4' },
  { path: 'b_doc_6', doumentUuid: '6' },
  { path: 'a_doc_7', doumentUuid: '7' },
]

describe('useTree', () => {
  it('return all node attributes', async () => {
    const { result } = renderHook(() =>
      useTree({ documents: list, generateNodeId: fakeRandomId }),
    )
    const root = result.current
    expect(root.id).toBe(FAKE_RANDOM_ID)
    expect(root.doc).toBeUndefined()
    expect(root.name).toBe('root')
    expect(root.children).toHaveLength(5)
  })

  it('should return a tree with children', async () => {
    const { result } = renderHook(() =>
      useTree({ documents: list, generateNodeId: fakeRandomId }),
    )
    expect(nodeToJson(result.current)).toEqual({
      id: FAKE_RANDOM_ID,
      name: 'root',
      children: [
        {
          id: FAKE_RANDOM_ID,
          name: 'a_thing',
          children: [
            {
              name: 'other-things',
              id: FAKE_RANDOM_ID,
              children: [{ id: '3', name: 'doc3', children: [] }],
            },
            { id: '1', name: 'doc1', children: [] },
            { id: '2', name: 'doc2', children: [] },
          ],
        },
        {
          name: 'b_thing',
          id: FAKE_RANDOM_ID,
          children: [{ id: '4', name: 'doc4', children: [] }],
        },
        {
          id: FAKE_RANDOM_ID,
          name: 'z_thing',
          children: [{ id: '5', name: 'doc5', children: [] }],
        },
        { id: '7', name: 'a_doc_7', children: [] },
        { id: '6', name: 'b_doc_6', children: [] },
      ],
    })
  })
})
