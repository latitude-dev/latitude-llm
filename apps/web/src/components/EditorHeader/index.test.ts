import { describe, expect, it } from 'vitest'

import { updatePromptMetadata } from './index'

describe('updatePromptMetadata', () => {
  it('should add frontmatter to a prompt without one', () => {
    const prompt = 'Hello world'
    const result = updatePromptMetadata(prompt, {
      provider: 'test',
      model: 'gpt-4',
    })
    expect(result).toContain('provider: test')
    expect(result).toContain('model: gpt-4')
    expect(result).toContain('Hello world')
  })

  it('should update existing frontmatter', () => {
    const prompt = `---
provider: old
temperature: 0.2
---
Hello world`
    const result = updatePromptMetadata(prompt, {
      provider: 'new',
      model: 'gpt-4',
    })
    expect(result).toContain('provider: new')
    expect(result).toContain('model: gpt-4')
    expect(result).toContain('temperature: 0.2')
    expect(result).toContain('Hello world')
    expect(result).not.toContain('provider: old')
  })

  it('should handle invalid frontmatter', () => {
    const prompt = `---
invalid: yaml:
:
---
Hello world`
    const result = updatePromptMetadata(prompt, {
      provider: 'test',
      model: 'gpt-4',
    })
    expect(result).toContain('provider: test')
    expect(result).toContain('model: gpt-4')
    expect(result).toContain('Hello world')
  })

  it('should handle empty frontmatter', () => {
    const prompt = `---
---
Hello world`
    const result = updatePromptMetadata(prompt, {
      provider: 'test',
      model: 'gpt-4',
    })
    expect(result).toContain('provider: test')
    expect(result).toContain('model: gpt-4')
    expect(result).toContain('Hello world')
  })

  it('should handle mdx with leading comments', () => {
    const prompt = `/*
  Returns a code suggestion, given a prompt and a request.
*/
---
provider: old
temperature: 0.2
---`
    const result = updatePromptMetadata(prompt, {
      provider: 'test',
      model: 'gpt-4',
    })
    expect(result).toContain('provider: test')
    expect(result).toContain('model: gpt-4')
    expect(result).not.toContain('provider: old')
  })
})
