import { parse } from 'promptl-ai'
import { describe, expect, it, vi } from 'vitest'
import { createBlocksChangeDeduper } from './fromLexicalToText'
import { BlockRootNode, fromAstToBlocks, fromBlocksToText } from './promptlToLexical'

function buildRoot(prompt: string): BlockRootNode {
  return fromAstToBlocks({ ast: parse(prompt), prompt })
}

describe('createBlocksChangeDeduper', () => {
  it('forwards a change once and suppresses an identical follow-up', () => {
    const onChange = vi.fn()
    const deduper = createBlocksChangeDeduper(buildRoot(''))
    const root = buildRoot('Hello world')

    deduper(root, onChange)
    deduper(root, onChange)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(fromBlocksToText(root))
  })

  it('does not forward a change that matches the initial value', () => {
    const onChange = vi.fn()
    const initialValue = buildRoot('Some existing prompt')
    const deduper = createBlocksChangeDeduper(initialValue)

    // The post-load transform re-emits the same (normalized) initial content.
    deduper(buildRoot('Some existing prompt'), onChange)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('forwards a genuinely different change with its serialized text', () => {
    const onChange = vi.fn()
    const deduper = createBlocksChangeDeduper(buildRoot('Before'))
    const root = buildRoot('After')

    deduper(root, onChange)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(fromBlocksToText(root))
  })

  it('fires each time the serialized text changes', () => {
    const onChange = vi.fn()
    const deduper = createBlocksChangeDeduper(buildRoot(''))
    const rootA = buildRoot('First edit')
    const rootB = buildRoot('Second edit')

    deduper(rootA, onChange)
    deduper(rootB, onChange)
    deduper(rootB, onChange)

    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenNthCalledWith(1, fromBlocksToText(rootA))
    expect(onChange).toHaveBeenNthCalledWith(2, fromBlocksToText(rootB))
  })
})
