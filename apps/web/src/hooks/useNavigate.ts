import { useMemo } from 'react'

import { type NavigateOptions } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { useRouter } from 'next/navigation'
import { start } from 'nprogress'

export function useNavigate() {
  const router = useRouter()
  return useMemo(() => {
    return {
      ...router,
      push: (url: string, options?: NavigateOptions) => {
        start()
        router.push(url, options)
      },
    }
  }, [router])
}
