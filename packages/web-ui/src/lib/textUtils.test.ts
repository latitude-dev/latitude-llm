import { describe, it, expect } from 'vitest'
import { extractLeadingEmoji } from './textUtils'

describe('extractLeadingEmoji', () => {
  it('extracts the leading emoji from a text', () => {
    const result = extractLeadingEmoji('🤖Lorem Ipsum')
    expect(result).toEqual(['🤖', 'Lorem Ipsum'])
  })

  it('removes space between the emoji and the text', () => {
    const result = extractLeadingEmoji('🤖 Lorem Ipsum')
    expect(result).toEqual(['🤖', 'Lorem Ipsum'])
  })

  it('returns undefined when there is no emoji', () => {
    const result = extractLeadingEmoji('Lorem Ipsum')
    expect(result).toEqual([undefined, 'Lorem Ipsum'])
  })

  it('does not extract single characters as emojis', () => {
    const result = extractLeadingEmoji('A Lorem Ipsum')
    expect(result).toEqual([undefined, 'A Lorem Ipsum'])
  })

  it('extracts only the first emoji', () => {
    const result = extractLeadingEmoji('👉👌 Lorem Ipsum')
    expect(result).toEqual(['👉', '👌 Lorem Ipsum'])
  })

  it('does not extract emojis if they are not at the beginning', () => {
    const result = extractLeadingEmoji('Lorem Ipsum 🤖')
    expect(result).toEqual([undefined, 'Lorem Ipsum 🤖'])
  })

  it('extracts skin-toned emojis correctly', () => {
    const result = extractLeadingEmoji('👍🏻 Lorem Ipsum')
    expect(result).toEqual(['👍🏻', 'Lorem Ipsum'])
  })

  it('extracts text-based emojis', () => {
    const result = extractLeadingEmoji('❤️ Lorem Ipsum')
    expect(result).toEqual(['❤️', 'Lorem Ipsum'])
  })

  it('extracts flag emojis correctly', () => {
    const result = extractLeadingEmoji('🇪🇸 Lorem Ipsum')
    expect(result).toEqual(['🇪🇸', 'Lorem Ipsum'])
  })

  it('extracts symbol/number emojis correctly', () => {
    const result = extractLeadingEmoji('1️⃣ Lorem Ipsum')
    expect(result).toEqual(['1️⃣', 'Lorem Ipsum'])
  })

  it('extracts joined emojis correctly', () => {
    const joinedEmojis = ['👨‍👩‍👧‍👦', '❤️‍🔥']
    for (const joinedEmoji of joinedEmojis) {
      const result = extractLeadingEmoji(joinedEmoji + ' Lorem Ipsum')
      expect(result).toEqual([joinedEmoji, 'Lorem Ipsum'])
    }
  })
})
