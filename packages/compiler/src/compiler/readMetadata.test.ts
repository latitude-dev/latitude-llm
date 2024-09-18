import { CUSTOM_TAG_END, CUSTOM_TAG_START } from '$compiler/constants'
import CompileError from '$compiler/error/error'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { readMetadata } from '.'
import { Document } from './readMetadata'
import { removeCommonIndent } from './utils'

type PromptTree = {
  [path: string]: string | PromptTree
}

const referenceFn = (prompts: PromptTree) => {
  return async (promptPath: string): Promise<Document | undefined> => {
    if (!(promptPath in prompts)) return undefined
    return {
      path: promptPath,
      content: prompts[promptPath]!,
    } as Document
  }
}

describe('resolvedPrompt', async () => {
  it('replaces reference tags with the referenced prompt', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        This is the parent prompt.
        <prompt path="child" />
        The end.
      `),
      child: removeCommonIndent('Lorem ipsum'),
    }

    const cleanParentMetadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: referenceFn(prompts),
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
        <prompt path="child" />
        <foo>
          This tag does not even exist
        </foo>
        The end.
      `),
      child: removeCommonIndent(`
        foo!
      `),
    }

    const cleanParentMetadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: referenceFn(prompts),
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
        <prompt path="child" />
      `),
      child: removeCommonIndent(`
        Child:
        <prompt path="grandchild" />
      `),
      grandchild: removeCommonIndent(`
        Grandchild.
      `),
    }

    const cleanParentMetadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: referenceFn(prompts),
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
          <prompt path="child1" />
        {{:else}}
          <prompt path="child2" />
        {{/if}}
      `),
      child1: removeCommonIndent(`
        foo!
      `),
      child2: removeCommonIndent(`
        bar!
      `),
    }

    const cleanParentMetadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: referenceFn(prompts),
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
        <prompt path="child" />
        The end.
      `),
    }

    const cleanParentMetadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: referenceFn(prompts),
    })

    expect(cleanParentMetadata.resolvedPrompt).toBe(
      removeCommonIndent(`
      This is the parent prompt.
      /* <prompt path="child" /> */
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
        <prompt path="child" />
      `),
      child: removeCommonIndent(`
        ---
        config: child
        foo: bar
        ---
        Child.
      `),
    }

    const cleanParentMetadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: referenceFn(prompts),
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
        <prompt path="child" />
        The end.
      `),
      child: removeCommonIndent(`
        /* This is the child document */
        Child.
      `),
    }

    const cleanParentMetadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: referenceFn(prompts),
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

  it('fails when there is content before the config section', async () => {
    const prompt = removeCommonIndent(`
      Lorem ipsum
      ---
      foo: bar
      baz:
       - qux
       - quux
      ---
    `)

    const metadata = await readMetadata({ prompt })

    expect(metadata.errors.length).toBe(1)
    expect(metadata.errors[0]).toBeInstanceOf(CompileError)
    expect(metadata.errors[0]!.code).toBe('invalid-config-placement')
  })

  it('fails when the config is not valid YAML', async () => {
    const prompt = removeCommonIndent(`
      ---
      foo: bar
      baa
      ---
    `)

    const metadata = await readMetadata({ prompt })

    expect(metadata.config).toEqual({ foo: 'bar', baa: null })
    expect(metadata.errors.length).toBe(1)
    expect(metadata.errors[0]).toBeInstanceOf(CompileError)
    expect(metadata.errors[0]!.code).toBe('invalid-config')
  })

  it('fails when there are multiple config sections', async () => {
    const prompt = removeCommonIndent(`
      ---
      foo: bar
      ---
      ---
      baz: qux
      ---
    `)

    const metadata = await readMetadata({ prompt })

    expect(metadata.errors.length).toBe(1)
    expect(metadata.errors[0]).toBeInstanceOf(CompileError)
    expect(metadata.errors[0]!.code).toBe('config-already-declared')
  })

  it('fails when a schema is provided and there is no config section', async () => {
    const prompt = removeCommonIndent(`
      Lorem ipsum
    `)

    const metadata = await readMetadata({
      prompt,
      configSchema: z.object({
        foo: z.string(),
      }),
    })

    expect(metadata.errors.length).toBe(1)
    expect(metadata.errors[0]).toBeInstanceOf(CompileError)
    expect(metadata.errors[0]!.code).toBe('config-not-found')
  })

  it('fails when the configSchema is not validated', async () => {
    const prompt = removeCommonIndent(`
      ---
      foo: 2
      ---
    `)

    const metadata = await readMetadata({
      prompt,
      configSchema: z.object({
        foo: z.string(),
      }),
    })

    expect(metadata.errors.length).toBe(1)
    expect(metadata.errors[0]).toBeInstanceOf(CompileError)
    expect(metadata.errors[0]!.code).toBe('invalid-config')
  })

  it('does not fail when the config schema is validated', async () => {
    const prompt = removeCommonIndent(`
      ---
      foo: bar
      ---
    `)

    const metadata = await readMetadata({
      prompt,
      configSchema: z.object({
        foo: z.string(),
      }),
    })

    expect(metadata.errors.length).toBe(0)
  })

  it('returns the correct positions of parsing errors', async () => {
    const prompt = removeCommonIndent(`
      /* 
        Lorem ipsum
      */
      ---
      foo: bar
      baa
      ---
    `)

    const expectedErrorPosition = prompt.indexOf('baa')

    const metadata = await readMetadata({ prompt })

    expect(metadata.errors.length).toBe(1)
    expect(metadata.errors[0]).toBeInstanceOf(CompileError)
    expect(metadata.errors[0]!.code).toBe('invalid-config')
    expect(metadata.errors[0]!.pos).toBe(expectedErrorPosition)
  })

  it('returns the correct positions of schema errors', async () => {
    const prompt = removeCommonIndent(`
      ---
      foo: bar
      ---
    `)

    const metadata = await readMetadata({
      prompt,
      configSchema: z.object({
        foo: z.number(),
      }),
    })
    const expectedErrorPosition = prompt.indexOf('bar')

    expect(metadata.errors.length).toBe(1)
    expect(metadata.errors[0]).toBeInstanceOf(CompileError)
    expect(metadata.errors[0]!.code).toBe('invalid-config')
    expect(metadata.errors[0]!.pos).toBe(expectedErrorPosition)
  })

  it('fails when the config section is defined inside an if block', async () => {
    const prompt = removeCommonIndent(`
      ${CUSTOM_TAG_START}#if true${CUSTOM_TAG_END}
        ---
        foo: bar
        ---
      ${CUSTOM_TAG_START}/if${CUSTOM_TAG_END}
    `)

    const metadata = await readMetadata({ prompt })

    expect(metadata.errors.length).toBe(1)
    expect(metadata.errors[0]).toBeInstanceOf(CompileError)
    expect(metadata.errors[0]!.code).toBe('config-outside-root')
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

  it('adds the correct parameters to the scope context', async () => {
    const prompt = `
      ${CUSTOM_TAG_START}foo${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}bar${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}#each arr as val${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}/each${CUSTOM_TAG_END}
    `

    const metadata = await readMetadata({
      prompt: removeCommonIndent(prompt),
    })

    expect(metadata.parameters).toEqual(new Set(['foo', 'bar', 'arr']))
  })
})

describe('referenced prompts', async () => {
  it('changes the parent resolvedPrompt with the referenced prompt has changed', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        This is the parent prompt.
        <prompt path="child" />
        The end.
      `),
      child: removeCommonIndent('Lorem ipsum'),
    }

    const metadata1 = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: referenceFn(prompts),
    })

    prompts['child'] = 'Latitude Rocks' // Modify child prompt

    const metadata2 = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: referenceFn(prompts),
    })

    expect(metadata1.resolvedPrompt).not.toBe(metadata2.resolvedPrompt)
  })

  it('includes parameters from referenced prompts', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        This is the parent prompt.
        ${CUSTOM_TAG_START}parentParam${CUSTOM_TAG_END}
        ${CUSTOM_TAG_START}parentDefinedVar = 5${CUSTOM_TAG_END}
        <prompt path="child" />
        The end.
      `),
      child: removeCommonIndent(`
        ${CUSTOM_TAG_START}childParam${CUSTOM_TAG_END}
        ${CUSTOM_TAG_START}parentDefinedVar${CUSTOM_TAG_END}
      `),
    }

    const metadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: referenceFn(prompts),
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

  it('finds circular references', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        This is the parent prompt.
        <prompt path="child" />
        The end.
      `),
      child: removeCommonIndent(`
        This is the child prompt.
        <prompt path="parent" />
      `),
    }

    const metadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: referenceFn(prompts),
    })

    expect(metadata.errors.length).toBe(1)
    expect(metadata.errors[0]).toBeInstanceOf(CompileError)
    expect(metadata.errors[0]!.code).toBe('circular-reference')
  })

  it('shows errors from referenced prompts as errors in the parent', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        This is the parent prompt.
        <prompt path="child" />
        The end.
      `),
      child: removeCommonIndent(`
        This is the child prompt.
        Error:
        <unknownTag />
      `),
    }

    const metadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: referenceFn(prompts),
    })

    expect(metadata.errors.length).toBe(1)
    expect(metadata.errors[0]).toBeInstanceOf(CompileError)
    expect(metadata.errors[0]!.code).toBe('reference-error')
    expect(metadata.errors[0]!.message).contains(
      'The referenced prompt contains an error:',
    )
    expect(metadata.errors[0]!.message).contains(`Unknown tag: 'unknownTag'`)
  })
})
