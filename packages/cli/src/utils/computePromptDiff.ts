import { hashContent } from './hashContent'

export interface IncomingPrompt {
  path: string
  content: string
}

export interface OriginPrompt {
  path: string
  content: string
  contentHash: string
}

export interface DiffResult {
  path: string
  localContent: string
  remoteContent?: string
  contentHash?: string
  status: 'added' | 'modified' | 'deleted' | 'unchanged'
}

/**
 * Compute diff between local and remote prompts locally
 */
export function computePromptDiff(
  incomingPrompts: IncomingPrompt[],
  originPrompts: OriginPrompt[],
): DiffResult[] {
  const diffResults: DiffResult[] = []
  const originPromptMap = new Map(
    originPrompts.map((prompt) => [prompt.path, prompt]),
  )

  // Check each local prompt
  for (const incomingPrompt of incomingPrompts) {
    const localContentHash = hashContent(incomingPrompt.content)
    const remotePrompt = originPromptMap.get(incomingPrompt.path)

    if (!remotePrompt) {
      // New prompt (added locally)
      diffResults.push({
        path: incomingPrompt.path,
        localContent: incomingPrompt.content,
        contentHash: localContentHash,
        status: 'added',
      })
    } else if (remotePrompt.contentHash !== localContentHash) {
      // Modified prompt
      diffResults.push({
        path: incomingPrompt.path,
        localContent: incomingPrompt.content,
        remoteContent: remotePrompt.content,
        contentHash: localContentHash,
        status: 'modified',
      })
    } else {
      // Unchanged prompt
      diffResults.push({
        path: incomingPrompt.path,
        localContent: incomingPrompt.content,
        remoteContent: remotePrompt.content,
        contentHash: localContentHash,
        status: 'unchanged',
      })
    }

    // Mark as processed
    originPromptMap.delete(incomingPrompt.path)
  }

  // Add remaining remote prompts as deleted
  for (const [_, remotePrompt] of originPromptMap.entries()) {
    diffResults.push({
      path: remotePrompt.path,
      localContent: '',
      remoteContent: remotePrompt.content,
      contentHash: '',
      status: 'deleted',
    })
  }

  return diffResults
}
