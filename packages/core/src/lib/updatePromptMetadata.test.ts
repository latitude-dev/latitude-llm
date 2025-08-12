import { describe, expect, it } from 'vitest'

import { updatePromptMetadata } from './updatePromptMetadata'

describe('updatePromptMetadata', () => {
  it('should add frontmatter to a prompt without one', () => {
    const prompt = 'Hello world'

    const result = updatePromptMetadata(prompt, {
      provider: 'test',
      model: 'gpt-4',
    })

    expect(result).toEqual(
      `
---
provider: test
model: gpt-4
---

Hello world
      `.trim(),
    )
  })

  it('should update existing frontmatter', () => {
    const prompt = `
---
provider: old
temperature: 0.2
---

Hello world
`.trim()

    const result = updatePromptMetadata(prompt, {
      provider: 'new',
      model: 'gpt-4',
    })

    expect(result).toEqual(
      `
---
provider: new
temperature: 0.2
model: gpt-4
---

Hello world
      `.trim(),
    )
  })

  it('should replace invalid frontmatter', () => {
    const prompt = `
---
invalid: yaml:
:
---
Hello world
`.trim()

    const result = updatePromptMetadata(prompt, {
      provider: 'test',
      model: 'gpt-4',
    })

    expect(result).toEqual(
      `
---
provider: test
model: gpt-4
---

Hello world
      `.trim(),
    )
  })

  it('should handle empty frontmatter', () => {
    const prompt = `
---
---
Hello world
`.trim()

    const result = updatePromptMetadata(prompt, {
      provider: 'test',
      model: 'gpt-4',
    })

    expect(result).toEqual(
      `
---
provider: test
model: gpt-4
---

Hello world
      `.trim(),
    )
  })

  it('should handle frontmatter with leading comments', () => {
    const prompt = `
/*
  Returns a code suggestion, given a prompt and a request.
*/
---
provider: old
temperature: 0.2
---

Hello world
`.trim()

    const result = updatePromptMetadata(prompt, {
      provider: 'test',
      model: 'gpt-4',
    })

    expect(result).toEqual(
      `
/*
  Returns a code suggestion, given a prompt and a request.
*/
---
provider: test
temperature: 0.2
model: gpt-4
---

Hello world
      `.trim(),
    )
  })

  it('should remove tools property when it is an empty array', () => {
    const prompt = `
---
provider: test
model: gpt-4
tools: []
temperature: 0.5
---

Hello world
`.trim()

    const result = updatePromptMetadata(prompt, {
      provider: 'updated',
    })

    expect(result).toEqual(
      `
---
provider: updated
model: gpt-4
temperature: 0.5
---

Hello world
      `.trim(),
    )
  })

  it('should keep tools property when it is not empty', () => {
    const prompt = `
---
provider: test
model: gpt-4
tools:
  - name: calculator
    type: function
temperature: 0.5
---

Hello world
`.trim()

    const result = updatePromptMetadata(prompt, {
      provider: 'updated',
    })

    expect(result).toEqual(
      `
---
provider: updated
model: gpt-4
tools:
  - name: calculator
    type: function
temperature: 0.5
---

Hello world
      `.trim(),
    )
  })

  it('should remove keys specified in keysToBeRemovedWhenNull when they are null - with valid frontmatter', () => {
    const prompt = `
---
provider: test
model: gpt-4
temperature: 0.5
---

Hello world
`.trim()

    const result = updatePromptMetadata(
      prompt,
      {
        provider: 'updated',
        model: null,
        temperature: 0.7,
      },
      { keysToBeRemovedWhenNull: ['model'] },
    )

    expect(result).toEqual(
      `
---
provider: updated
temperature: 0.7
---

Hello world
      `.trim(),
    )
  })

  it('should remove keys specified in keysToBeRemovedWhenNull when they are undefined - with valid frontmatter', () => {
    const prompt = `
---
provider: test
model: gpt-4
temperature: 0.5
---

Hello world
`.trim()

    const result = updatePromptMetadata(
      prompt,
      {
        provider: 'updated',
        model: undefined,
        temperature: 0.7,
      },
      { keysToBeRemovedWhenNull: ['model'] },
    )

    expect(result).toEqual(
      `
---
provider: updated
temperature: 0.7
---

Hello world
      `.trim(),
    )
  })

  it('should not remove keys specified in keysToBeRemovedWhenNull when they have valid values - with valid frontmatter', () => {
    const prompt = `
---
provider: test
model: gpt-4
temperature: 0.5
---

Hello world
`.trim()

    const result = updatePromptMetadata(
      prompt,
      {
        provider: 'updated',
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
      },
      { keysToBeRemovedWhenNull: ['model'] },
    )

    expect(result).toEqual(
      `
---
provider: updated
model: gpt-3.5-turbo
temperature: 0.7
---

Hello world
      `.trim(),
    )
  })

  it('should remove keys specified in keysToBeRemovedWhenNull when they are null - without valid frontmatter', () => {
    const prompt = 'Hello world'

    const result = updatePromptMetadata(
      prompt,
      {
        provider: 'test',
        model: null,
        temperature: 0.5,
      },
      { keysToBeRemovedWhenNull: ['model'] },
    )

    expect(result).toEqual(
      `
---
provider: test
temperature: 0.5
---

Hello world
      `.trim(),
    )
  })

  it('should remove keys specified in keysToBeRemovedWhenNull when they are undefined - without valid frontmatter', () => {
    const prompt = 'Hello world'

    const result = updatePromptMetadata(
      prompt,
      {
        provider: 'test',
        model: undefined,
        temperature: 0.5,
      },
      { keysToBeRemovedWhenNull: ['model'] },
    )

    expect(result).toEqual(
      `
---
provider: test
temperature: 0.5
---

Hello world
      `.trim(),
    )
  })

  it('should remove keys specified in keysToBeRemovedWhenNull when they are null - with invalid frontmatter', () => {
    const prompt = `
---
invalid: yaml:
:
---
Hello world
`.trim()

    const result = updatePromptMetadata(
      prompt,
      {
        provider: 'test',
        model: null,
        temperature: 0.5,
      },
      { keysToBeRemovedWhenNull: ['model'] },
    )

    expect(result).toEqual(
      `
---
provider: test
temperature: 0.5
---

Hello world
      `.trim(),
    )
  })

  it('should handle multiple keys in keysToBeRemovedWhenNull', () => {
    const prompt = `
---
provider: test
model: gpt-4
temperature: 0.5
tools: []
---

Hello world
`.trim()

    const result = updatePromptMetadata(
      prompt,
      {
        provider: 'updated',
        model: null,
        temperature: undefined,
        maxOutputTokens: 1000,
      },
      { keysToBeRemovedWhenNull: ['model', 'temperature'] },
    )

    expect(result).toEqual(
      `
---
provider: updated
maxTokens: 1000
---

Hello world
      `.trim(),
    )
  })
})
