// @vitest-environment jsdom

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Node, SidebarDocument, useTree } from './index'
import { ModifiedDocumentType } from '@latitude-data/core/constants'

const FAKE_RANDOM_ID = 'RANDOM_ID'

function fakeRandomId({ uuid }: { uuid?: string } = {}) {
  if (uuid) return uuid

  return FAKE_RANDOM_ID
}

function nodeToJson(
  node: Node,
  includeChangeType?: boolean,
  includeRunning?: boolean,
): object {
  return {
    id: node.id,
    name: node.name,
    path: node.path,
    depth: node.depth,
    children: node.children.map((c) =>
      nodeToJson(c, includeChangeType, includeRunning),
    ),
    ...(includeChangeType ? { changeType: node.changeType } : {}),
    ...(includeRunning
      ? { isRunning: node.isRunning, runningCount: node.runningCount }
      : {}),
  }
}

const documents: SidebarDocument[] = [
  { path: 'a_thing/doc1', documentUuid: '1', content: '1' },
  { path: 'a_thing/doc2', documentUuid: '2', content: '2' },
  { path: 'a_thing/other-things/doc3', documentUuid: '3', content: '3' },
  { path: 'z_thing/doc5', documentUuid: '5', content: '5' },
  { path: 'b_thing/doc4', documentUuid: '4', content: '4' },
  { path: 'b_doc_6', documentUuid: '6', content: '6' },
  { path: 'a_doc_7', documentUuid: '7', content: '7' },
]

describe('useTree', () => {
  it('return all node attributes', async () => {
    const { result } = renderHook(() =>
      useTree({
        documents: documents,
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
          { path: 'a', documentUuid: '1', content: '1' },
          { path: 'a/b', documentUuid: '2', content: '2' },
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
        documents: documents,
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

  it('calculates changes accordingly', async () => {
    const liveDocuments: SidebarDocument[] = [
      { path: '1_unchanged_document', documentUuid: '0', content: 'unchanged' },
      { path: '2_updated_document', documentUuid: '1', content: 'original' },
      { path: '3_document_to_be_renamed', documentUuid: '2', content: 'foo' },
      {
        path: '4_update_folder/updated_file',
        documentUuid: '3',
        content: 'original',
      },
      {
        path: '5_unchanged_folder/unchanged_document',
        documentUuid: '4',
        content: 'unchanged',
      },
    ]

    const draftDocuments: SidebarDocument[] = [
      { path: '1_unchanged_document', documentUuid: '0', content: 'unchanged' },
      { path: '2_updated_document', documentUuid: '1', content: 'updated' },
      { path: '3_renamed_document', documentUuid: '2', content: 'foo' },
      {
        path: '4_update_folder/updated_file',
        documentUuid: '3',
        content: 'updated',
      },
      {
        path: '5_unchanged_folder/unchanged_document',
        documentUuid: '4',
        content: 'unchanged',
      },
      { path: '6_new_document', documentUuid: '5', content: 'new' },
      { path: '7_new_folder/new_document', documentUuid: '6', content: 'new' },
    ]

    const { result } = renderHook(() =>
      useTree({
        documents: draftDocuments,
        liveDocuments: liveDocuments,
        generateNodeId: fakeRandomId,
      }),
    )

    expect(nodeToJson(result.current, true)).toEqual({
      id: FAKE_RANDOM_ID,
      name: 'root',
      path: '',
      depth: 0,
      children: [
        {
          id: FAKE_RANDOM_ID,
          name: '4_update_folder',
          path: '4_update_folder',
          depth: 1,
          changeType: ModifiedDocumentType.Updated,
          children: [
            {
              id: '3',
              name: 'updated_file',
              path: '4_update_folder/updated_file',
              depth: 2,
              changeType: ModifiedDocumentType.Updated,
              children: [],
            },
          ],
        },
        {
          id: FAKE_RANDOM_ID,
          name: '5_unchanged_folder',
          path: '5_unchanged_folder',
          depth: 1,
          changeType: undefined,
          children: [
            {
              id: '4',
              name: 'unchanged_document',
              path: '5_unchanged_folder/unchanged_document',
              depth: 2,
              changeType: undefined,
              children: [],
            },
          ],
        },
        {
          id: FAKE_RANDOM_ID,
          name: '7_new_folder',
          path: '7_new_folder',
          depth: 1,
          changeType: ModifiedDocumentType.Created,
          children: [
            {
              id: '6',
              name: 'new_document',
              path: '7_new_folder/new_document',
              depth: 2,
              changeType: ModifiedDocumentType.Created,
              children: [],
            },
          ],
        },
        {
          id: '0',
          name: '1_unchanged_document',
          path: '1_unchanged_document',
          depth: 1,
          changeType: undefined,
          children: [],
        },
        {
          id: '1',
          name: '2_updated_document',
          path: '2_updated_document',
          depth: 1,
          changeType: ModifiedDocumentType.Updated,
          children: [],
        },
        {
          id: '2',
          name: '3_renamed_document',
          path: '3_renamed_document',
          depth: 1,
          changeType: ModifiedDocumentType.UpdatedPath,
          children: [],
        },
        {
          id: '5',
          name: '6_new_document',
          path: '6_new_document',
          depth: 1,
          changeType: ModifiedDocumentType.Created,
          children: [],
        },
      ],
    })
  })

  describe('running documents', () => {
    it('marks files as running with correct count', () => {
      const runningDocumentsMap = new Map<string, number>([
        ['1', 1], // doc1 has 1 run
        ['3', 2], // doc3 has 2 runs
      ])

      const { result } = renderHook(() =>
        useTree({
          documents: documents,
          runningDocumentsMap,
          generateNodeId: fakeRandomId,
        }),
      )

      const root = result.current
      const aThing = root.children.find((c) => c.name === 'a_thing')!
      const doc1 = aThing.children.find((c) => c.name === 'doc1')!
      const otherThings = aThing.children.find(
        (c) => c.name === 'other-things',
      )!
      const doc3 = otherThings.children.find((c) => c.name === 'doc3')!

      // Check running files
      expect(doc1.isRunning).toBe(true)
      expect(doc1.runningCount).toBe(1)
      expect(doc3.isRunning).toBe(true)
      expect(doc3.runningCount).toBe(2)

      // Check non-running files
      const doc2 = aThing.children.find((c) => c.name === 'doc2')!
      expect(doc2.isRunning).toBe(false)
      expect(doc2.runningCount).toBe(0)
    })

    it('marks top-level folders as running with total count', () => {
      const runningDocumentsMap = new Map<string, number>([
        ['1', 1], // a_thing/doc1
        ['3', 2], // a_thing/other-things/doc3
      ])

      const { result } = renderHook(() =>
        useTree({
          documents: documents,
          runningDocumentsMap,
          generateNodeId: fakeRandomId,
        }),
      )

      const root = result.current
      const aThing = root.children.find((c) => c.name === 'a_thing')!

      // Top-level folder should be marked as running with total count
      expect(aThing.isRunning).toBe(true)
      expect(aThing.runningCount).toBe(3) // 1 + 2

      // Nested folder should NOT be marked as running (only top-level)
      const otherThings = aThing.children.find(
        (c) => c.name === 'other-things',
      )!
      expect(otherThings.isRunning).toBe(false)
      expect(otherThings.runningCount).toBe(2) // Has the count but not marked as running
    })

    it('does not mark folders as running when no descendants are running', () => {
      const runningDocumentsMap = new Map<string, number>([
        ['5', 1], // z_thing/doc5
      ])

      const { result } = renderHook(() =>
        useTree({
          documents: documents,
          runningDocumentsMap,
          generateNodeId: fakeRandomId,
        }),
      )

      const root = result.current
      const aThing = root.children.find((c) => c.name === 'a_thing')!
      const bThing = root.children.find((c) => c.name === 'b_thing')!
      const zThing = root.children.find((c) => c.name === 'z_thing')!

      // Only z_thing should be running
      expect(aThing.isRunning).toBe(false)
      expect(bThing.isRunning).toBe(false)
      expect(zThing.isRunning).toBe(true)
      expect(zThing.runningCount).toBe(1)
    })

    it('handles empty running documents map', () => {
      const runningDocumentsMap = new Map<string, number>()

      const { result } = renderHook(() =>
        useTree({
          documents: documents,
          runningDocumentsMap,
          generateNodeId: fakeRandomId,
        }),
      )

      const root = result.current
      root.children.forEach((child) => {
        expect(child.isRunning).toBe(false)
        expect(child.runningCount).toBe(0)
      })
    })

    it('handles undefined running documents map', () => {
      const { result } = renderHook(() =>
        useTree({
          documents: documents,
          generateNodeId: fakeRandomId,
        }),
      )

      const root = result.current
      root.children.forEach((child) => {
        expect(child.isRunning).toBe(false)
        expect(child.runningCount).toBe(0)
      })
    })

    it('correctly sums running counts across nested folders', () => {
      const runningDocumentsMap = new Map<string, number>([
        ['1', 2], // a_thing/doc1 - 2 runs
        ['2', 1], // a_thing/doc2 - 1 run
        ['3', 3], // a_thing/other-things/doc3 - 3 runs
      ])

      const { result } = renderHook(() =>
        useTree({
          documents: documents,
          runningDocumentsMap,
          generateNodeId: fakeRandomId,
        }),
      )

      const root = result.current
      const aThing = root.children.find((c) => c.name === 'a_thing')!

      // Top-level folder should have sum of all descendants
      expect(aThing.isRunning).toBe(true)
      expect(aThing.runningCount).toBe(6) // 2 + 1 + 3
    })
  })
})
