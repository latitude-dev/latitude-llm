import { useMemo } from 'react'

import { DocumentVersion, toTree } from '@latitude-data/core'

export function useTree({ documents }: { documents: DocumentVersion[] }) {
  return useMemo(() => toTree(documents), [documents])
}
