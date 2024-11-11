import { TAG_NAMES } from '$promptl/constants'
import CompileError from '$promptl/error/error'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { readMetadata } from '.'
import { Document } from './types'
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

describe('hash', async () => {
  it('always returns the same hash for the same prompt', async () => {
    const prompt1 = 'This is a prompt'
    const prompt2 = 'This is a prompt'
    const prompt3 = 'This is another prompt'

    const metadata1 = await readMetadata({ prompt: prompt1 })
    const metadata2 = await readMetadata({ prompt: prompt2 })
    const metadata3 = await readMetadata({ prompt: prompt3 })

    expect(metadata1.hash).toBe(metadata2.hash)
    expect(metadata1.hash).not.toBe(metadata3.hash)
  })

  it('includes the content from referenced tags into account when calculating the hash', async () => {
    const parent = 'This is the parent prompt. <prompt path="child" /> The end.'
    const child1 = 'ABCDEFG'
    const child2 = '1234567'

    const metadata1 = await readMetadata({
      prompt: parent,
      referenceFn: referenceFn({ child: child1 }),
    })
    const metadata2 = await readMetadata({
      prompt: parent,
      referenceFn: referenceFn({ child: child2 }),
    })

    expect(metadata1.hash).not.toBe(metadata2.hash)
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
      grandchild1: removeCommonIndent(`
        Grandchild 1.
      `),
      grandchild2: removeCommonIndent(`
        Grandchild 2.
      `),
    }

    const parentMetadata1 = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: referenceFn({
        ...prompts,
        grandchild: prompts['grandchild1'],
      }),
    })

    const parentMetadata2 = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: referenceFn({
        ...prompts,
        grandchild: prompts['grandchild2'],
      }),
    })

    expect(parentMetadata1.hash).not.toBe(parentMetadata2.hash)
  })

  it('works with nested tags', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        {{if foo}}
          <prompt path="child1" />
        {{else}}
          <prompt path="child2" />
        {{endif}}
      `),
      child1: removeCommonIndent(`
        foo!
      `),
      child2v1: removeCommonIndent(`
        bar!
      `),
      child2v2: removeCommonIndent(`
        baz!
      `),
    }

    const parentMetadatav1 = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: referenceFn({
        ...prompts,
        child2: prompts['child2v1'],
      }),
    })

    const parentMetadatav2 = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: referenceFn({
        ...prompts,
        child2: prompts['child2v2'],
      }),
    })

    expect(parentMetadatav1.hash).not.toBe(parentMetadatav2.hash)
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

  it('does not confuse several dashes with a config section', async () => {
    const prompt = removeCommonIndent(`
      This is not config:
      --------------------

      Nor this:
      ----

      This ain't either:
      --
    `)

    const metadata = await readMetadata({
      prompt: removeCommonIndent(prompt),
    })

    expect(metadata.errors[0]?.toString()).toBeUndefined()
    expect(metadata.errors.length).toBe(0)
    expect(metadata.config).toEqual({})
  })

  it('can be escaped', async () => {
    const prompt = removeCommonIndent(`
      This is NOT a config:
      \\---
      foo: bar
      baz:
       - qux
       - quux
      \\---
    `)

    const metadata = await readMetadata({ prompt })

    expect(metadata.config).toEqual({})
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
      {{ if true }}
        ---
        foo: bar
        ---
      {{ endif }}
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
      {{ foo }}
    `

    const metadata = await readMetadata({
      prompt: removeCommonIndent(prompt),
    })

    expect(metadata.parameters).toEqual(new Set(['foo']))
  })

  it('ignores variables that are defined in the prompt', async () => {
    const prompt = `
      {{ foo = 5 }}
      {{ foo }}
    `

    const metadata = await readMetadata({
      prompt: removeCommonIndent(prompt),
    })

    expect(metadata.parameters).toEqual(new Set())
  })

  it('adds the correct parameters to the scope context', async () => {
    const prompt = `
      {{ foo }}
      {{ bar }}
      {{ for val in arr }}
      {{ endfor }}
    `

    const metadata = await readMetadata({
      prompt: removeCommonIndent(prompt),
    })

    expect(metadata.parameters).toEqual(new Set(['foo', 'bar', 'arr']))
  })
})

describe('referenced prompts', async () => {
  it('does not include parameters from referenced prompts', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        This is the parent prompt.
        {{ parentParam }}
        <prompt path="child" />
        The end.
      `),
      child: removeCommonIndent(`
        {{ childParam }}
      `),
    }

    const metadata = await readMetadata({
      prompt: prompts['parent']!,
      referenceFn: referenceFn(prompts),
    })

    expect(metadata.parameters).toContain('parentParam')
    expect(metadata.parameters).not.toContain('childParam')
  })

  it('returns an error if a child param is not included in the reference tag', async () => {
    const prompts = {
      child: removeCommonIndent(`
        {{ childParam }}
      `),
      parentCorrect: removeCommonIndent(`
        This is the parent prompt.
        <prompt path="child" childParam={{foo}} />
        The end.
      `),
      parentWrong: removeCommonIndent(`
        This is the parent prompt.
        <prompt path="child" />
        The end.
      `),
    }

    const metadataCorrect = await readMetadata({
      prompt: prompts['parentCorrect']!,
      referenceFn: referenceFn(prompts),
    })

    expect(metadataCorrect.errors.length).toBe(0)

    const metadataWrong = await readMetadata({
      prompt: prompts['parentWrong']!,
      referenceFn: referenceFn(prompts),
    })

    expect(metadataWrong.errors.length).toBe(1)
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
        Error: (close unopened tag)
        </${TAG_NAMES.message}>
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
    expect(metadata.errors[0]!.message).contains(
      `Unexpected closing tag for ${TAG_NAMES.message}`,
    )
  })
})
