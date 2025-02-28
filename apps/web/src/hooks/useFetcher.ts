import { useToast } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'

import { useNavigate } from './useNavigate'

type ISearchParams =
  | Record<string, string>
  | string[][]
  | string
  | URLSearchParams
  | undefined

export default function useFetcher(
  route?: string,
  {
    fallback = [],
    serializer,
    searchParams,
  }: {
    fallback?: any
    serializer?: (item: any) => any
    searchParams?: ISearchParams
  } = { fallback: [] },
) {
  const { toast } = useToast()
  const navigate = useNavigate()

  return async () => {
    if (!route) return fallback

    const response = await fetch(buildRoute(route, searchParams), {
      credentials: 'include',
    })
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        toast({
          title: 'You are being redirected...',
          description:
            'You are not authorized to access this resource, redirecting your to the login page',
        })

        navigate.push(ROUTES.auth.login)
      } else if (response.status >= 500) {
        toast({
          title: 'Server error',
          description: 'Something went wrong on the server',
          variant: 'destructive',
        })
      } else if (response.status !== 404) {
        const error = await response.json()

        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        })
      }

      return fallback
    }

    return serializer
      ? serializer(await response.json())
      : await response.json()
  }
}

function buildRoute(route: string, searchParams?: ISearchParams) {
  if (!searchParams) return route

  const params = new URLSearchParams(searchParams)
  return route.toString() + '?' + params.toString()
}

export type UseFetcherArgs = Parameters<typeof useFetcher>
