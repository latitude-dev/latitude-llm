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
    depth: node.depth,
    containsSelected: node.containsSelected,
    selected: node.selected,
    children: node.children.map(nodeToJson),
  }
}

let list = [
  { path: 'a_thing/doc1', documentUuid: '1' },
  { path: 'a_thing/doc2', documentUuid: '2' },
  { path: 'a_thing/other-things/doc3', documentUuid: '3' },
  { path: 'z_thing/doc5', documentUuid: '5' },
  { path: 'b_thing/doc4', documentUuid: '4' },
  { path: 'b_doc_6', documentUuid: '6' },
  { path: 'a_doc_7', documentUuid: '7' },
]

describe('useTree', () => {
  it('return all node attributes', async () => {
    const { result } = renderHook(() =>
      useTree({
        documents: list,
        currentDocumentUuid: '4',
        generateNodeId: fakeRandomId,
      }),
    )
    const root = result.current
    expect(root.id).toBe(FAKE_RANDOM_ID)
    expect(root.doc).toBeUndefined()
    expect(root.name).toBe('root')
    expect(root.isFile).toBeFalsy()
    expect(root.children).toHaveLength(5)
  })

  it('should return a tree with children', async () => {
    const { result } = renderHook(() =>
      useTree({
        documents: list,
        currentDocumentUuid: '4',
        generateNodeId: fakeRandomId,
      }),
    )
    expect(nodeToJson(result.current)).toEqual({
      id: FAKE_RANDOM_ID,
      name: 'root',
      depth: 0,
      selected: false,
      containsSelected: true,
      children: [
        {
          id: FAKE_RANDOM_ID,
          name: 'a_thing',
          depth: 1,
          selected: false,
          containsSelected: false,
          children: [
            {
              name: 'other-things',
              id: FAKE_RANDOM_ID,
              depth: 2,
              selected: false,
              containsSelected: false,
              children: [
                {
                  id: '3',
                  selected: false,
                  containsSelected: false,
                  depth: 3,
                  name: 'doc3',
                  children: [],
                },
              ],
            },
            {
              id: '1',
              selected: false,
              containsSelected: false,
              depth: 2,
              name: 'doc1',
              children: [],
            },
            {
              id: '2',
              selected: false,
              containsSelected: false,
              depth: 2,
              name: 'doc2',
              children: [],
            },
          ],
        },
        {
          name: 'b_thing',
          id: FAKE_RANDOM_ID,
          depth: 1,
          selected: false,
          containsSelected: true,
          children: [
            {
              id: '4',
              selected: true,
              containsSelected: false,
              depth: 2,
              name: 'doc4',
              children: [],
            },
          ],
        },
        {
          id: FAKE_RANDOM_ID,
          name: 'z_thing',
          depth: 1,
          selected: false,
          containsSelected: false,
          children: [
            {
              id: '5',
              selected: false,
              containsSelected: false,
              depth: 2,
              name: 'doc5',
              children: [],
            },
          ],
        },
        {
          id: '7',
          selected: false,
          containsSelected: false,
          depth: 1,
          name: 'a_doc_7',
          children: [],
        },
        {
          id: '6',
          selected: false,
          containsSelected: false,
          depth: 1,
          name: 'b_doc_6',
          children: [],
        },
      ],
    })
  })
})
