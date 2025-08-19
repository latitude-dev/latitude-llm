import type { DocumentVersion, SimplifiedDocumentVersion } from './models'

export const EMAIL_REGEX =
  /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*)@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/gi

export function resolveRelativePath(refPath: string, from?: string): string {
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

export function createRelativePath(refPath: string, from?: string): string {
  if (!from) {
    return '/' + refPath
  }

  const refSegments = refPath.split('/')
  const currentSegments = from.split('/').slice(0, -1)

  const commonSegments = []
  for (let i = 0; i < refSegments.length && i < currentSegments.length; i++) {
    if (refSegments[i] !== currentSegments[i]) {
      break
    }

    commonSegments.push(refSegments[i])
  }

  const upSegments = currentSegments
    .slice(commonSegments.length)
    .map(() => '..')
  const downSegments = refSegments.slice(commonSegments.length)

  const fullRefPath = [...upSegments, ...downSegments].join('/')

  return refPath.length < fullRefPath.length ? '/' + refPath : fullRefPath
}

export function simplifyDocument(
  document: DocumentVersion,
): SimplifiedDocumentVersion {
  return {
    documentUuid: document.documentUuid,
    path: document.path,
    content: document.content,
    isDeleted: document.deletedAt !== null,
  }
}

export function isSafeUrl(url: unknown): url is string | URL {
  const isUrl =
    url instanceof URL ||
    (typeof url === 'string' && (url.startsWith('/') || URL.canParse(url)))
  if (!isUrl) return false

  if (url.toString().startsWith('/')) return true
  if (url.toString().startsWith('https')) return true
  if (url.toString().startsWith('http://localhost')) return true

  return false
}

export function isLatitudeUrl(url: unknown): url is string | URL {
  if (!isSafeUrl(url)) return false

  if (url.toString().startsWith('/')) return true
  if (url.toString().startsWith('http://localhost')) return true
  if (url.toString().startsWith('https://latitude.so')) return true
  if (url.toString().startsWith('https://app.latitude.so')) return true

  return false
}
