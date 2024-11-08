import { readMetadata } from '@latitude-data/compiler'
import { type DocumentVersion } from '@latitude-data/core/browser'

export type ReadMetadataWorkerProps = Parameters<typeof readMetadata>[0] & {
  document?: DocumentVersion
  documents?: DocumentVersion[]
}

self.onmessage = async function (event: { data: ReadMetadataWorkerProps }) {
  const { document, documents, prompt, ...rest } = event.data

  const referenceFn = readDocument(document, documents, prompt)
  const metadata = await readMetadata({
    ...rest,
    prompt,
    referenceFn: referenceFn ?? undefined,
  })

  const { setConfig: _, errors: errors, ...returnedMetadata } = metadata

  const errorsWithPositions = errors.map((error) => {
    return {
      start: {
        line: error.start?.line ?? 0,
        column: error.start?.column ?? 0,
      },
      end: {
        line: error.end?.line ?? 0,
        column: error.end?.column ?? 0,
      },
      message: error.message,
      name: error.name,
    }
  })

  self.postMessage({
    ...returnedMetadata,
    errors: errorsWithPositions,
  })
}

function readDocument(
  document?: DocumentVersion,
  documents?: DocumentVersion[],
  prompt?: string,
) {
  if (!document || !documents || !prompt) return undefined

  return async (refPath: string, from?: string) => {
    const fullPath = resolveRelativePath(refPath, from)

    if (fullPath === document.path) {
      return {
        path: fullPath,
        content: prompt,
      }
    }

    const content = documents.find((d) => d.path === fullPath)?.content
    if (content === undefined) return undefined

    return {
      path: fullPath,
      content,
    }
  }
}

function resolveRelativePath(refPath: string, from?: string): string {
  if (refPath.startsWith('/')) {
    return refPath.slice(1)
  }

  if (!from) {
    return refPath
  }

  const fromDir = from.split('/').slice(0, -1).join('/')

  const segments = refPath.split('/')
  const resultSegments = fromDir ? fromDir.split('/') : []

  for (const segment of segments) {
    if (segment === '..') {
      resultSegments.pop()
    } else if (segment !== '.') {
      resultSegments.push(segment)
    }
  }

  return resultSegments.join('/')
}
