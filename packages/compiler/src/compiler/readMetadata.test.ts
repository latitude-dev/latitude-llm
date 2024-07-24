import { CUSTOM_TAG_END, CUSTOM_TAG_START } from '$compiler/constants'
import CompileError from '$compiler/error/error'
import { describe, expect, it } from 'vitest'

import { readMetadata } from '.'
import { removeCommonIndent } from './utils'

describe('resolvedPrompt', async () => {
  it('replaces reference tags with the referenced prompt', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        This is the parent prompt.
        <ref prompt="child" />
        The end.
      `),
      child: removeCommonIndent('Lorem ipsum'),
    } as Record<string, string>

    const cleanParentMetadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: async (promptPath: string): Promise<string> => {
        return prompts[promptPath]!
      },
    })

    expect(cleanParentMetadata.resolvedPrompt).toBe(
      removeCommonIndent(`
      This is the parent prompt.
      Lorem ipsum
      The end.
    `),
    )
  })

  it('ignores any other tag and logic', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        This is the parent prompt.
        {{ unknownVariable }}
        <user name={{ username }}>
          Test
        </user>
        <ref prompt="child" />
        <foo>
          This tag does not even exist
        </foo>
        The end.
      `),
      child: removeCommonIndent(`
        foo!
      `),
    } as Record<string, string>

    const referenceFn = async (promptPath: string): Promise<string> => {
      return prompts[promptPath]!
    }

    const cleanParentMetadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn,
    })

    expect(cleanParentMetadata.resolvedPrompt).toBe(
      removeCommonIndent(`
        This is the parent prompt.
        {{ unknownVariable }}
        <user name={{ username }}>
          Test
        </user>
        foo!
        <foo>
          This tag does not even exist
        </foo>
        The end.
    `),
    )
  })

  it('works with multiple levels of nesting', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        Parent:
        <ref prompt="child" />
      `),
      child: removeCommonIndent(`
        Child:
        <ref prompt="grandchild" />
      `),
      grandchild: removeCommonIndent(`
        Grandchild.
      `),
    } as Record<string, string>

    const cleanParentMetadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: async (promptPath: string): Promise<string> => {
        return prompts[promptPath]!
      },
    })

    expect(cleanParentMetadata.resolvedPrompt).toBe(
      removeCommonIndent(`
      Parent:
      Child:
      Grandchild.
    `),
    )
  })

  it('workes with nested tags', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        {{#if foo}}
          <ref prompt="child1" />
        {{:else}}
          <ref prompt="child2" />
        {{/if}}
      `),
      child1: removeCommonIndent(`
        foo!
      `),
      child2: removeCommonIndent(`
        bar!
      `),
    } as Record<string, string>

    const cleanParentMetadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: async (promptPath: string): Promise<string> => {
        return prompts[promptPath]!
      },
    })

    expect(cleanParentMetadata.resolvedPrompt).toBe(
      removeCommonIndent(`
      {{#if foo}}
        foo!
      {{:else}}
        bar!
      {{/if}}
    `),
    )
  })

  it('failed references are replaced with a comment', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        This is the parent prompt.
        <ref prompt="child" />
        The end.
      `),
    } as Record<string, string>

    const referenceFn = async (promptPath: string): Promise<string> => {
      if (!(promptPath in prompts)) throw new Error('Not found')
      return prompts[promptPath]!
    }

    const cleanParentMetadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn,
    })

    expect(cleanParentMetadata.resolvedPrompt).toBe(
      removeCommonIndent(`
      This is the parent prompt.
      /* <ref prompt="child" /> */
      The end.
    `),
    )
  })

  it('returns only the parent config', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        ---
        config: parent
        ---
        Parent.
        <ref prompt="child" />
      `),
      child: removeCommonIndent(`
        ---
        config: child
        foo: bar
        ---
        Child.
      `),
    } as Record<string, string>

    const referenceFn = async (promptPath: string): Promise<string> => {
      return prompts[promptPath]!
    }

    const cleanParentMetadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn,
    })

    expect(cleanParentMetadata.resolvedPrompt).toBe(
      removeCommonIndent(`
      ---
      config: parent
      ---
      Parent.
      Child.
    `),
    )
  })

  it('removes comments', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        Parent. /* This is the parent document */
        <ref prompt="child" />
        The end.
      `),
      child: removeCommonIndent(`
        /* This is the child document */
        Child.
      `),
    } as Record<string, string>

    const referenceFn = async (promptPath: string): Promise<string> => {
      return prompts[promptPath]!
    }

    const cleanParentMetadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn,
    })

    expect(cleanParentMetadata.resolvedPrompt).toBe(
      removeCommonIndent(`
      Parent. 

      Child.
      The end.
    `),
    )
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
  it('changes the parent resolvedPrompt with the referenced prompt has changed', async () => {
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

    expect(metadata1.resolvedPrompt).not.toBe(metadata2.resolvedPrompt)
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
