'use client'

import { ComponentType, lazy, useEffect, useState } from 'react'
import { EditorCellProps } from './types'

const CellTextEditorLazy = lazy(() =>
  import('./Editor').then(
    (module) =>
      ({
        default: module.EditCell,
      }) as {
        default: ComponentType<EditorCellProps>
      },
  ),
)

function EditorCellWrapper(props: EditorCellProps) {
  // When imported, Monaco automatically tries to use the window object. Since
  // this is not available when rendering on the server, we only render the
  // fallback component for SSR.
  const [isBrowser, setIsBrowser] = useState(false)

  useEffect(() => {
    setIsBrowser(typeof window !== 'undefined')
  }, [])

  if (!isBrowser) return null

  return <CellTextEditorLazy {...props} />
}

export type { EditorCellProps }
export { EditorCellWrapper as DataGridCellEditor }
