import { PROJECT_MAIN_DOCUMENT } from '@latitude-data/constants/dualScope'

type IsRootDocumentArgs = {
  documentPath: string
  promptManagement: boolean
}

/**
 * Determines if the current document is the "root document" in only-traces mode.
 * This is true when prompt management is disabled AND the document is the
 * synthetic PROJECT_MAIN_DOCUMENT used for project-level features.
 */
export function isRootDocument({
  documentPath,
  promptManagement,
}: IsRootDocumentArgs): boolean {
  return !promptManagement && documentPath === PROJECT_MAIN_DOCUMENT
}
