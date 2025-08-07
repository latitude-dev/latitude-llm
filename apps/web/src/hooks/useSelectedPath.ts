import { usePathname } from 'next/navigation'

export function useSelectedPath({ pickFirstSegment = true }: { pickFirstSegment?: boolean } = {}) {
  const pathname = usePathname()
  const selected = pathname && pickFirstSegment ? pathname.split('/')[1] : pathname
  return selected
}
