import { parse, stringify } from 'yaml'

function extractFrontMatter(content: string) {
  const match = content.match(/(?:\/\*[\s\S]*?\*\/\s*)?---\n([\s\S]*?)\n---/)
  return match ? match[1] : null
}

function formatPrompt({
  frontMatter,
  prompt,
}: {
  frontMatter: string
  prompt: string
}) {
  return `---\n${frontMatter}---\n\n${prompt.replace(/(?:\n)?---[\s\S]*?---(?:\n)?/g, '')}`
}

function cleanUpdatesFromNullKeys(
  updates: Record<string, any>,
  keysToBeRemovedWhenNull?: string[],
): Record<string, any> {
  const cleanUpdates = { ...updates }
  if (keysToBeRemovedWhenNull) {
    for (const key of keysToBeRemovedWhenNull) {
      if (cleanUpdates[key] == null) {
        delete cleanUpdates[key]
      }
    }
  }
  return cleanUpdates
}

export function updatePromptMetadata(
  prompt: string,
  updates: Record<string, any>,
  { keysToBeRemovedWhenNull }: { keysToBeRemovedWhenNull?: string[] } = {},
) {
  // Check if the prompt has frontmatter
  if (!prompt.match(/(?:\/\*[\s\S]*?\*\/\s*)?---/)) {
    // If no frontmatter exists, create one with the updates
    const cleanUpdates = cleanUpdatesFromNullKeys(
      updates,
      keysToBeRemovedWhenNull,
    )
    const newFrontMatter = stringify(cleanUpdates)
    return `---\n${newFrontMatter}---\n\n${prompt}`
  }

  try {
    const frontMatter = extractFrontMatter(prompt)
    if (!frontMatter) {
      const cleanUpdates = cleanUpdatesFromNullKeys(
        updates,
        keysToBeRemovedWhenNull,
      )
      // Invalid frontmatter format, create new one
      return formatPrompt({ frontMatter: stringify(cleanUpdates), prompt })
    }

    // Parse existing frontmatter
    const parsed = parse(frontMatter) || {}

    // Merge updates with existing frontmatter
    const updated = {
      ...parsed,
      ...updates,
    }

    if (keysToBeRemovedWhenNull) {
      for (const key of keysToBeRemovedWhenNull) {
        if (updates[key] == null && key in updated) {
          delete updated[key]
        }
      }
    }

    if (
      'tools' in updated &&
      Array.isArray(updated.tools) &&
      updated.tools.length === 0
    ) {
      // If tools is an empty array, remove it from the frontmatter
      delete updated.tools
    }

    // Stringify the updated frontmatter
    const newFrontMatter = stringify(updated)

    // Replace old frontmatter with new one, preserving any leading comments
    return prompt.replace(
      /((?:\/\*[\s\S]*?\*\/\s*)?---\n)[\s\S]*?\n---/,
      `$1${newFrontMatter}---`,
    )
  } catch (_error) {
    // If parsing fails, create new frontmatter
    const cleanUpdates = cleanUpdatesFromNullKeys(
      updates,
      keysToBeRemovedWhenNull,
    )
    return formatPrompt({ frontMatter: stringify(cleanUpdates), prompt })
  }
}
