import CompileError from '$compiler/error/error'
import { describe, expect, it } from 'vitest'

import { compile, readMetadata } from '.'
import { removeCommonIndent } from './utils'

const getExpectedError = async (
  fn: () => Promise<void>,
  errorMessage: string,
): Promise<CompileError> => {
  try {
    await fn()
  } catch (err) {
    expect(err).toBeInstanceOf(CompileError)
    return err as CompileError
  }
  throw new Error(errorMessage)
}

const expectBothErrors = async ({
  code,
  prompt,
  referenceFn,
}: {
  code: string
  prompt: string
  referenceFn?: (promptPath: string) => Promise<string>
}) => {
  const compileError = await getExpectedError(async () => {
    await compile({
      prompt: removeCommonIndent(prompt),
      parameters: {},
      referenceFn,
    })
  }, `Expected compile to throw '${code}'`)
  expect(compileError.code).toBe(code)

  const metadata = await readMetadata({
    prompt: removeCommonIndent(prompt),
    referenceFn,
  })
  if (metadata.errors.length === 0) {
    throw new Error(`Expected readMetadata to throw '${code}'`)
  }
  const metadataError = metadata.errors[0]!

  expect(metadataError.code).toBe(code)
  expect(compileError.code).toBe(metadataError.code)
}

describe(`all compilation errors that don't require value resolution are caught both in compile and readMetadata`, () => {
  it.todo('unsupported-base-node-type') // This one requires the parser to return an unsupported node type, which is not reproducible

  it('variable-already-declared', async () => {
    const prompt = `
      {{foo = 5}}
      {{#each [1, 2, 3] as foo}}
        {{foo}}
      {{/each}}
    `

    await expectBothErrors({
      code: 'variable-already-declared',
      prompt,
    })
  })

  it.todo('invalid-object-key', async () => {
    // Parser does not even parse this prompt
    const prompt = `
      {{ foo = 5 }}
      {{ { [1, 2, 3]: 'bar' } }}
    `

    await expectBothErrors({
      code: 'invalid-object-key',
      prompt,
    })
  })

  it.todo('unsupported-operator', async () => {
    // Parser does not even parse this prompt
    const prompt = `
      {{ foo = 5 ++ 2 }}
    `

    await expectBothErrors({
      code: 'unsupported-operator',
      prompt,
    })
  })

  it('invalid-assignment', async () => {
    const prompt = `
      {{ [ foo ] = [ 5 ] }}
    `

    await expectBothErrors({
      code: 'invalid-assignment',
      prompt,
    })
  })

  it('invalid-tool-call-placement', async () => {
    const prompt = `
      <user>
        <tool-call id="foo" name="bar" />
      </user>
    `

    await expectBothErrors({
      code: 'invalid-tool-call-placement',
      prompt,
    })
  })

  it('unknown-tag', async () => {
    const prompt = `
      <foo>
        Foo
      </foo>
    `

    await expectBothErrors({
      code: 'unknown-tag',
      prompt,
    })
  })

  it('message-tag-inside-message', async () => {
    const prompt = `
      <system>
        <user>
          Foo
        </user>
      </system>
    `

    await expectBothErrors({
      code: 'message-tag-inside-message',
      prompt,
    })
  })

  it('content-tag-inside-content', async () => {
    const prompt = `
      <text>
        <text>
          Foo
        </text>
      </text>
    `

    await expectBothErrors({
      code: 'content-tag-inside-content',
      prompt,
    })
  })

  it('tool-call-tag-inside-content', async () => {
    const prompt = `
      <text>
        <tool-call id="foo" name="bar" />
      </text>
    `

    await expectBothErrors({
      code: 'tool-call-tag-inside-content',
      prompt,
    })
  })

  it('tool-call-tag-without-id', async () => {
    const prompt = `
      <assistant>
        <tool-call name="bar" />
      </assistant>
    `

    await expectBothErrors({
      code: 'tool-call-tag-without-id',
      prompt,
    })
  })

  it('tool-message-without-id', async () => {
    const prompt = `
      <tool>
        Foo
      </tool>
    `

    await expectBothErrors({
      code: 'tool-message-without-id',
      prompt,
    })
  })

  it('tool-call-without-name', async () => {
    const prompt = `
      <assistant>
        <tool-call id="foo" />
      </assistant>
    `

    await expectBothErrors({
      code: 'tool-call-without-name',
      prompt,
    })
  })

  it('message-tag-without-role', async () => {
    const prompt = `
      <message>
        Foo
      </message>
    `

    await expectBothErrors({
      code: 'message-tag-without-role',
      prompt,
    })
  })

  it('invalid-reference-prompt-placement', async () => {
    const prompt = `
      <user>
        <ref prompt="foo" />
      </user>
    `

    await expectBothErrors({
      code: 'invalid-reference-prompt-placement',
      prompt,
      referenceFn: () => Promise.resolve('bar'),
    })
  })

  it('reference-tag-without-prompt', async () => {
    const prompt = `
      <ref />
    `

    await expectBothErrors({
      code: 'reference-tag-without-prompt',
      prompt,
      referenceFn: () => Promise.resolve('bar'),
    })
  })

  it('missing-reference-function', async () => {
    const prompt = `
      <ref prompt="foo" />
    `

    await expectBothErrors({
      code: 'missing-reference-function',
      prompt,
    })
  })

  it('reference-error', async () => {
    const prompt = `
      <ref prompt="foo" />
    `

    await expectBothErrors({
      code: 'reference-error',
      prompt,
      referenceFn: () => Promise.reject(new Error('foo')),
    })
  })

  it('reference-tag-has-content', async () => {
    const prompt = `
      <ref prompt="foo">
        Foo
      </ref>
    `

    await expectBothErrors({
      code: 'reference-tag-has-content',
      prompt,
      referenceFn: () => Promise.resolve('bar'),
    })
  })

  it('invalid-static-attribute', async () => {
    const prompt = `
      <ref prompt={{foo}} />
    `

    await expectBothErrors({
      code: 'invalid-static-attribute',
      prompt,
    })
  })
})
