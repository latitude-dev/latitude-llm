import { parse, stringify } from 'yaml'

function extractFrontMatter(content: string) {
  const match = content.match(/(?:\/\*[\s\S]*?\*\/\s*)?---\n([\s\S]*?)\n---/)
  return match ? match[1] : null
}

export function updatePromptMetadata(
  prompt: string,
  updates: Record<string, any>,
) {
  // Check if the prompt has frontmatter
  if (!prompt.match(/(?:\/\*[\s\S]*?\*\/\s*)?---/)) {
    // If no frontmatter exists, create one with the updates
    const newFrontMatter = stringify(updates)
    return `---\n${newFrontMatter}---\n\n${prompt}`
  }

  try {
    const frontMatter = extractFrontMatter(prompt)
    if (!frontMatter) {
      // Invalid frontmatter format, create new one
      const newFrontMatter = stringify(updates)
      return `---\n${newFrontMatter}---\n\n${prompt.replace(/(?:\/\*[\s\S]*?\*\/\s*)?---\n[\s\S]*?\n---\n/, '')}`
    }

    // Parse existing frontmatter
    const parsed = parse(frontMatter) || {}

    // Merge updates with existing frontmatter
    const updated = {
      ...parsed,
      ...updates,
    }

    // Stringify the updated frontmatter
    const newFrontMatter = stringify(updated)

    // Replace old frontmatter with new one, preserving any leading comments
    return prompt.replace(
      /((?:\/\*[\s\S]*?\*\/\s*)?---\n)[\s\S]*?\n---/,
      `$1${newFrontMatter}---`,
    )
  } catch (error) {
    // If parsing fails, create new frontmatter
    const newFrontMatter = stringify(updates)
    return `---\n${newFrontMatter}---\n\n${prompt.replace(/(?:\/\*[\s\S]*?\*\/\s*)?---\n[\s\S]*?\n---\n/, '')}`
  }
}
