import { describe, expect, it } from 'vitest'

import { updatePromptMetadata } from './promptMetadata'

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
})
