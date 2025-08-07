import { describe, expect, it } from 'vitest'
import { disambiguateFilePaths } from './disambiguateFilePaths'

describe('disambiguateFilePaths', () => {
  it('only returns the names from the paths when no name is repeated', () => {
    const paths = ['folder1/A', 'folder2/B', 'folder3/C']

    const result = disambiguateFilePaths(paths)
    expect(result).toEqual([
      { name: 'A', path: 'folder1/A' },
      { name: 'B', path: 'folder2/B' },
      { name: 'C', path: 'folder3/C' },
    ])
  })

  it('adds context to the repeated names', () => {
    const paths = ['folder1/A', 'folder2/A', 'folder3/B']

    const result = disambiguateFilePaths(paths)
    expect(result).toEqual([
      { name: 'A', context: 'folder1', path: 'folder1/A' },
      { name: 'A', context: 'folder2', path: 'folder2/A' },
      { name: 'B', path: 'folder3/B' },
    ])
  })

  it('adds ellipsis at start when the non-repeated context is at the end', () => {
    const paths = ['folder1/subfolder1/A', 'folder1/subfolder2/A', 'folder2/B']

    const result = disambiguateFilePaths(paths)
    expect(result).toEqual([
      { name: 'A', context: '…/subfolder1', path: 'folder1/subfolder1/A' },
      { name: 'A', context: '…/subfolder2', path: 'folder1/subfolder2/A' },
      { name: 'B', path: 'folder2/B' },
    ])
  })

  it('adds ellipsis at the end when the non-repeated context is at the start', () => {
    const paths = ['folder1/subfolder1/A', 'folder2/subfolder1/A', 'folder2/B']

    const result = disambiguateFilePaths(paths)
    expect(result).toEqual([
      { name: 'A', context: 'folder1/…', path: 'folder1/subfolder1/A' },
      { name: 'A', context: 'folder2/…', path: 'folder2/subfolder1/A' },
      { name: 'B', path: 'folder2/B' },
    ])
  })

  it('adds ellipsis at both sides when non-repeated context is in the middle', () => {
    const paths = [
      'parent1/child1/grandchild1/A',
      'parent1/child2/grandchild1/A',
      'parent2/B',
    ]

    const result = disambiguateFilePaths(paths)
    expect(result).toEqual([
      {
        name: 'A',
        context: '…/child1/…',
        path: 'parent1/child1/grandchild1/A',
      },
      {
        name: 'A',
        context: '…/child2/…',
        path: 'parent1/child2/grandchild1/A',
      },
      { name: 'B', path: 'parent2/B' },
    ])
  })
})
