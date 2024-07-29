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
    id: node.id,
    name: node.name,
    path: node.path,
    depth: node.depth,
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

  it('renders folder with same name as file in the same level', async () => {
    const { result } = renderHook(() =>
      useTree({
        documents: [
          { path: 'a', documentUuid: '1' },
          { path: 'a/b', documentUuid: '2' },
        ],
        generateNodeId: fakeRandomId,
      }),
    )

    expect(nodeToJson(result.current)).toEqual({
      id: FAKE_RANDOM_ID,
      name: 'root',
      path: '',
      depth: 0,
      children: [
        {
          id: FAKE_RANDOM_ID,
          name: 'a',
          path: 'a',
          depth: 1,
          children: [
            {
              id: '2',
              name: 'b',
              path: 'a/b',
              depth: 2,
              children: [],
            },
          ],
        },
        {
          id: '1',
          name: 'a',
          path: 'a',
          depth: 1,
          children: [],
        },
      ],
    })
  })

  it('should return a tree with children', async () => {
    const { result } = renderHook(() =>
      useTree({
        documents: list,
        generateNodeId: fakeRandomId,
      }),
    )
    expect(nodeToJson(result.current)).toEqual({
      id: FAKE_RANDOM_ID,
      name: 'root',
      path: '',
      depth: 0,
      children: [
        {
          id: FAKE_RANDOM_ID,
          name: 'a_thing',
          path: 'a_thing',
          depth: 1,
          children: [
            {
              id: FAKE_RANDOM_ID,
              name: 'other-things',
              path: 'a_thing/other-things',
              depth: 2,
              children: [
                {
                  id: '3',
                  name: 'doc3',
                  path: 'a_thing/other-things/doc3',
                  depth: 3,
                  children: [],
                },
              ],
            },
            {
              id: '1',
              name: 'doc1',
              path: 'a_thing/doc1',
              depth: 2,
              children: [],
            },
            {
              id: '2',
              path: 'a_thing/doc2',
              depth: 2,
              name: 'doc2',
              children: [],
            },
          ],
        },
        {
          id: FAKE_RANDOM_ID,
          name: 'b_thing',
          path: 'b_thing',
          depth: 1,
          children: [
            {
              id: '4',
              name: 'doc4',
              path: 'b_thing/doc4',
              depth: 2,
              children: [],
            },
          ],
        },
        {
          id: FAKE_RANDOM_ID,
          name: 'z_thing',
          path: 'z_thing',
          depth: 1,
          children: [
            {
              id: '5',
              name: 'doc5',
              path: 'z_thing/doc5',
              depth: 2,
              children: [],
            },
          ],
        },
        {
          id: '7',
          name: 'a_doc_7',
          path: 'a_doc_7',
          depth: 1,
          children: [],
        },
        {
          id: '6',
          name: 'b_doc_6',
          path: 'b_doc_6',
          depth: 1,
          children: [],
        },
      ],
    })
  })
})
