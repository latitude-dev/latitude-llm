import { type CompileError } from 'promptl-ai'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { LatitudeError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { scanDocumentContent } from './scan'

// Promptl `code` values for compile errors emitted on reference (<prompt path="..." />) tags.
// Sourced from promptl's `errors` map in node_modules/promptl-ai/dist/index.js.
// Used as a guard so we only try to extract a `path` attribute from the offending
// source range when the error is actually about a reference tag.
const REFERENCE_ERROR_CODES = new Set([
  'reference-not-found',
  'circular-reference',
  'reference-missing-parameter',
  'reference-error',
  'reference-depth-limit',
  'invalid-reference-path',
  'reference-tag-without-prompt',
  'missing-reference-function',
])

function formatScanError(content: string, error: CompileError): string {
  const base = `${error.code}: ${error.message}`
  if (!REFERENCE_ERROR_CODES.has(error.code)) return base

  const snippet = content.slice(error.startIndex, error.endIndex)
  const match = snippet.match(/path\s*=\s*['"]([^'"]+)['"]/)
  if (!match) return base

  return `${base} (path: ${match[1]})`
}

export async function getResolvedContent({
  commit,
  document,
  customPrompt,
}: {
  document: DocumentVersion
  commit: Commit
  customPrompt?: string
}): Promise<TypedResult<string, LatitudeError>> {
  if (
    customPrompt === undefined &&
    commit.mergedAt != null &&
    document.resolvedContent != null
  ) {
    return Result.ok(document.resolvedContent!)
  }

  const content = customPrompt ?? document.content
  const metadataResult = await scanDocumentContent({
    document: {
      ...document,
      content,
    },
    commit,
  })

  if (metadataResult.error) return metadataResult

  const metadata = metadataResult.unwrap()

  if (metadata.errors.length > 0) {
    const message = metadata.errors
      .map((error) => formatScanError(content, error))
      .join('\n')

    return Result.error(new LatitudeError(message))
  }

  return Result.ok(metadata.resolvedPrompt)
}
