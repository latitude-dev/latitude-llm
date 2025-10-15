import Link from 'next/link'
import { ReactNode } from 'react'

/**
 * A reusable layout component for selection items in the sidebar.
 * Provides a consistent container with slots for icon, content, and actions.
 *
 * Usage:
 * ```tsx
 * <SelectionSubItem
 *   icon={<Icon name="bot" />}
 *   content={<Text>My content</Text>}
 *   actions={<Button onClick={...} />}
 *   href="/path" // or onClick={...}
 * />
 * ```
 */
export function SelectionSubItem({
  icon,
  content,
  actions,
  href,
  onClick,
  disabled,
}: {
  icon: ReactNode
  content: ReactNode
  actions?: ReactNode
  href?: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <div className='group flex flex-row items-center gap-x-3 rounded-lg min-w-0 p-2 hover:bg-backgroundCode'>
      {href ? (
        <Link
          href={href}
          className='flex items-center gap-x-2 flex-1 min-w-0 overflow-hidden'
        >
          <div className='shrink-0'>{icon}</div>
          <div className='flex-1 min-w-0'>{content}</div>
        </Link>
      ) : onClick ? (
        <button
          onClick={onClick}
          disabled={disabled}
          className='flex items-center gap-x-2 flex-1 min-w-0 overflow-hidden text-left bg-transparent border-none p-0 cursor-pointer'
        >
          <div className='shrink-0'>{icon}</div>
          <div className='flex-1 min-w-0'>{content}</div>
        </button>
      ) : (
        <div className='flex items-center gap-x-2 flex-1 min-w-0 overflow-hidden'>
          <div className='shrink-0'>{icon}</div>
          <div className='flex items-center flex-1 min-w-0'>{content}</div>
        </div>
      )}
      <div className='flex items-center shrink-0'>{actions}</div>
    </div>
  )
}

/**
 * Helper function to get the directory path hint for display (without the filename).
 * Examples:
 * - "folder/file.txt" -> "folder/"
 * - "a/b/c/file.txt" -> "a/.../c/"
 * - "a/b/c/d/e/file.txt" -> "a/.../e/"
 */
export function getPathHint(path: string): string | null {
  const parts = path.split('/')
  if (parts.length <= 1) return null

  const pathParts = parts.slice(0, -1) // Remove filename

  if (pathParts.length === 1) {
    return pathParts[0] + '/'
  }

  if (pathParts.length === 2) {
    return pathParts.join('/') + '/'
  }

  // For longer paths, show: first-folder/.../parent-folder/
  const firstFolder = pathParts[0]
  const parentFolder = pathParts[pathParts.length - 1]

  return `${firstFolder}/.../${parentFolder}/`
}
