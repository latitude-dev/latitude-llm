import { CUSTOM_TAG_END, CUSTOM_TAG_START } from '$/constants'
import CompileError from '$/error/error'
import { describe, expect, it } from 'vitest'

import { readMetadata } from '.'
import { removeCommonIndent } from './utils'

describe('hash', async () => {
  it('always returns the same hash for the same prompt', async () => {
    const prompt = `
      foo
      bar
    `

    const metadata1 = await readMetadata({
      prompt: removeCommonIndent(prompt),
    })

    const metadata2 = await readMetadata({
      prompt: removeCommonIndent(prompt),
    })

    expect(metadata1.hash).toBe(metadata2.hash)
  })

  it('always returns different hashes for different prompts', async () => {
    const prompt1 = `
      foo
      bar
    `
    const prompt2 = `
      foo
      baz
    `

    const metadata1 = await readMetadata({
      prompt: removeCommonIndent(prompt1),
    })

    const metadata2 = await readMetadata({
      prompt: removeCommonIndent(prompt2),
    })

    expect(metadata1.hash).not.toBe(metadata2.hash)
  })
})

describe('config', async () => {
  it('compiles the YAML written in the config section and returns it as the config attribute in the result', async () => {
    const prompt = `
      ---
      foo: bar
      baz:
       - qux
       - quux
      ---
    `
    const metadata = await readMetadata({
      prompt: removeCommonIndent(prompt),
    })

    expect(metadata.config).toEqual({
      foo: 'bar',
      baz: ['qux', 'quux'],
    })
  })

  it('does not compile the prompt as YAML when it is not the first element in the prompt', async () => {
    const prompt = `
      Lorem ipsum
      ---
      foo: bar
      baz:
       - qux
       - quux
      ---
    `

    const metadata = await readMetadata({
      prompt: removeCommonIndent(prompt),
    })

    expect(metadata.config).toEqual({})
  })
})

describe('parameters', async () => {
  it('detects undefined variables being used in the prompt', async () => {
    const prompt = `
      ${CUSTOM_TAG_START}foo${CUSTOM_TAG_END}
    `

    const metadata = await readMetadata({
      prompt: removeCommonIndent(prompt),
    })

    expect(metadata.parameters).toEqual(new Set(['foo']))
  })

  it('ignores variables that are defined in the prompt', async () => {
    const prompt = `
      ${CUSTOM_TAG_START}foo = 5${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}foo${CUSTOM_TAG_END}
    `

    const metadata = await readMetadata({
      prompt: removeCommonIndent(prompt),
    })

    expect(metadata.parameters).toEqual(new Set())
  })
})

describe('referenced prompts', async () => {
  it('changes the parent hash with the referenced prompt has changed', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        This is the parent prompt.
        <ref prompt="child" />
        The end.
      `),
      child: removeCommonIndent('Lorem ipsum'),
    } as Record<string, string>

    const referenceFn = async (promptPath: string): Promise<string> => {
      return prompts[promptPath]!
    }

    const metadata1 = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn,
    })

    prompts['child'] = 'Latitude Rocks' // Modify child prompt

    const metadata2 = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn,
    })

    expect(metadata1.hash).not.toBe(metadata2.hash)
  })

  it('returns a list of all referenced prompts', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        This is the parent prompt.
        <ref prompt="child1" />
        <ref prompt="child2" />
        The end.
      `),
      child1: removeCommonIndent('Lorem ipsum'),
      child2: removeCommonIndent('<ref prompt="grandchild" />'),
      grandchild: removeCommonIndent('Foo bar'),
    } as Record<string, string>

    const referenceFn = async (promptPath: string): Promise<string> => {
      return prompts[promptPath]!
    }

    const metadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn,
    })

    expect(metadata.referencedPrompts).toEqual(
      new Set(['child1', 'child2', 'grandchild']),
    )
  })

  it('includes parameters from referenced prompts', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        This is the parent prompt.
        ${CUSTOM_TAG_START}parentParam${CUSTOM_TAG_END}
        ${CUSTOM_TAG_START}parentDefinedVar = 5${CUSTOM_TAG_END}
        <ref prompt="child" />
        The end.
      `),
      child: removeCommonIndent(`
        ${CUSTOM_TAG_START}childParam${CUSTOM_TAG_END}
        ${CUSTOM_TAG_START}parentDefinedVar${CUSTOM_TAG_END}
      `),
    } as Record<string, string>

    const referenceFn = async (promptPath: string): Promise<string> => {
      return prompts[promptPath]!
    }

    const metadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn,
    })

    // parentDefinedVar should not be included as parameter
    expect(metadata.parameters).toEqual(new Set(['parentParam', 'childParam']))
  })
})

describe('syntax errors', async () => {
  it('returns CompileErrors when the prompt syntax is invalid', async () => {
    const prompt = `
      <user>
        <user>
        </user>
      </user>
    `

    const metadata = await readMetadata({
      prompt,
    })

    expect(metadata.errors.length).toBe(1)
    expect(metadata.errors[0]).toBeInstanceOf(CompileError)
  })
})
