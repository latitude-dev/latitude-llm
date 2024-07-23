import { act, renderHook } from '@testing-library/react'
import { Node } from '$ui/sections/Document/Sidebar/Files/useTree'
import { afterEach, describe, expect, it } from 'vitest'

import { useTempNodes } from './index'

describe('useTempNodes', () => {
  afterEach(() => {
    useTempNodes.getState().reset()
  })

  it('should add a folder', async () => {
    const { result } = renderHook(() => useTempNodes((state) => state))
    act(() =>
      result.current.addFolder({
        parentPath: 'some-folder',
        parentId: 'fake-id',
      }),
    )

    expect(result.current.tmpFolders).toEqual({
      'some-folder': [
        new Node({
          id: expect.any(String),
          path: 'some-folder/ ',
          name: ' ',
          isPersisted: false,
        }),
      ],
    })
  })

  it('should update a folder', async () => {
    const { result } = renderHook(() => useTempNodes((state) => state))
    act(() =>
      result.current.addFolder({
        parentPath: 'some-folder',
        parentId: 'fake-id',
      }),
    )
    const id = result?.current?.tmpFolders?.['some-folder']?.[0]?.id
    act(() => result.current.updateFolder({ id: id!, path: 'new-name' }))

    expect(result.current.tmpFolders).toEqual({
      'some-folder': [
        new Node({
          id: expect.any(String),
          path: 'some-folder/new-name',
          name: 'new-name',
          isPersisted: false,
        }),
      ],
    })
  })

  it('should delete a folder', async () => {
    const { result } = renderHook(() => useTempNodes((state) => state))
    act(() =>
      result.current.addFolder({
        parentPath: 'some-folder',
        parentId: 'fake-id',
      }),
    )
    const id = result?.current?.tmpFolders?.['some-folder']?.[0]?.id
    act(() => result.current.deleteTmpFolder({ id: id! }))

    expect(result.current.tmpFolders).toEqual({ 'some-folder': [] })
  })

  it('should delete a folder children of another tmp folder', async () => {
    const { result } = renderHook(() => useTempNodes((state) => state))
    act(() =>
      result.current.addFolder({
        parentPath: 'some-folder',
        parentId: 'fake-id',
      }),
    )
    const id = result?.current?.tmpFolders?.['some-folder']?.[0]?.id
    act(() =>
      result.current.updateFolder({ id: id!, path: 'parent-tmp-folder' }),
    )

    act(() =>
      result.current.addFolder({
        parentPath: 'some-folder/parent-tmp-folder',
        parentId: id!,
      }),
    )

    const childId =
      result?.current?.tmpFolders?.['some-folder']?.[0]?.children?.[0]?.id
    act(() =>
      result.current.updateFolder({ id: childId!, path: 'child-tmp-folder' }),
    )
    act(() => result.current.deleteTmpFolder({ id: childId! }))

    expect(result.current.tmpFolders).toEqual({
      'some-folder': [
        new Node({
          id: expect.any(String),
          path: 'some-folder/parent-tmp-folder',
          name: 'parent-tmp-folder',
          isPersisted: false,
          children: [],
        }),
      ],
    })
  })

  it('should update the parent folder children', async () => {
    const { result } = renderHook(() => useTempNodes((state) => state))
    act(() =>
      result.current.addFolder({
        parentPath: 'some-folder',
        parentId: 'fake-id',
      }),
    )
    const id = result?.current?.tmpFolders?.['some-folder']?.[0]?.id
    act(() =>
      result.current.updateFolder({ id: id!, path: 'parent-tmp-folder' }),
    )

    act(() =>
      result.current.addFolder({
        parentPath: 'some-folder/parent-tmp-folder',
        parentId: id!,
      }),
    )

    const childId =
      result?.current?.tmpFolders?.['some-folder']?.[0]?.children?.[0]?.id

    act(() =>
      result.current.updateFolder({ id: childId!, path: 'child-tmp-folder' }),
    )

    const child = new Node({
      id: expect.any(String),
      path: 'some-folder/parent-tmp-folder/child-tmp-folder',
      name: 'child-tmp-folder',
      isPersisted: false,
      isRoot: false,
    })
    const rootTmpNode = new Node({
      id: expect.any(String),
      path: 'some-folder/parent-tmp-folder',
      name: 'parent-tmp-folder',
      isPersisted: false,
      children: [child],
    })
    child.parent = rootTmpNode
    rootTmpNode.children[0]!.parent = rootTmpNode
    expect(result.current.tmpFolders).toEqual({
      'some-folder': [rootTmpNode],
    })
  })
})
