import { describe, expect, it } from 'vitest'
import { getDocumentType } from './update'
import { DocumentType } from '../../constants'

describe('getDocumentType', () => {
  describe('returns DocumentType.Prompt', () => {
    it('when content is empty', async () => {
      const result = await getDocumentType({ content: '' })
      expect(result).toBe(DocumentType.Prompt)
    })

    it('when content has only whitespace', async () => {
      const result = await getDocumentType({ content: '   \n  \n  ' })
      expect(result).toBe(DocumentType.Prompt)
    })

    it('when content has no frontmatter', async () => {
      const result = await getDocumentType({
        content: 'Just some plain text without frontmatter',
      })
      expect(result).toBe(DocumentType.Prompt)
    })

    it('when content has text but no YAML config', async () => {
      const result = await getDocumentType({
        content: `
This is a prompt
With multiple lines
But no configuration
        `.trim(),
      })
      expect(result).toBe(DocumentType.Prompt)
    })

    it('when content has empty frontmatter', async () => {
      // Empty frontmatter has no config keys, so it's treated as Prompt
      const result = await getDocumentType({
        content: `---
---

Content here`,
      })
      expect(result).toBe(DocumentType.Prompt)
    })
  })

  describe('explicit type override', () => {
    it('returns Prompt when type: prompt is explicitly set', async () => {
      const result = await getDocumentType({
        content: `---
provider: openai
model: gpt-4o
type: prompt
---

Content here`,
      })
      expect(result).toBe(DocumentType.Prompt)
    })

    it('returns Prompt when only type: prompt is set', async () => {
      const result = await getDocumentType({
        content: `---
type: prompt
---

Content here`,
      })
      expect(result).toBe(DocumentType.Prompt)
    })
  })

  describe('returns DocumentType.Agent', () => {
    it('when content has provider in frontmatter', async () => {
      const result = await getDocumentType({
        content: `---
provider: openai
---

Content here`,
      })
      expect(result).toBe(DocumentType.Agent)
    })

    it('when content has model in frontmatter', async () => {
      const result = await getDocumentType({
        content: `---
model: gpt-4o
---

Content here`,
      })
      expect(result).toBe(DocumentType.Agent)
    })

    it('when content has provider and model in frontmatter', async () => {
      const result = await getDocumentType({
        content: `---
provider: openai
model: gpt-4o
---

Content here`,
      })
      expect(result).toBe(DocumentType.Agent)
    })

    it('when content has full config in frontmatter', async () => {
      const result = await getDocumentType({
        content: `---
provider: openai
model: gpt-4o
temperature: 0.7
type: agent
tools:
  - tool1
  - tool2
---

Content here`,
      })
      expect(result).toBe(DocumentType.Agent)
    })

    it('when content has type: agent in frontmatter', async () => {
      const result = await getDocumentType({
        content: `---
provider: openai
model: gpt-4o
type: agent
---

Agent content`,
      })
      expect(result).toBe(DocumentType.Agent)
    })

    it('when content has only temperature in frontmatter', async () => {
      const result = await getDocumentType({
        content: `---
temperature: 1
---

Content`,
      })
      expect(result).toBe(DocumentType.Agent)
    })

    it('when content has any valid config key', async () => {
      const result = await getDocumentType({
        content: `---
maxTokens: 100
---

Content`,
      })
      expect(result).toBe(DocumentType.Agent)
    })
  })

  describe('handles edge cases', () => {
    it('returns Prompt when content has no valid config', async () => {
      const result = await getDocumentType({
        content: 'Some plain text content without any configuration',
      })
      expect(result).toBe(DocumentType.Prompt)
    })

    it('returns Prompt for simple markdown without frontmatter', async () => {
      const result = await getDocumentType({
        content: `# This is a title

This is some content without frontmatter.

- Item 1
- Item 2`,
      })
      expect(result).toBe(DocumentType.Prompt)
    })
  })
})
