import { ROUTES } from '$/services/routes'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useCallback } from 'react'
import { useNavigate } from './useNavigate'

type ISearchParams =
  | Record<string, string>
  | string[][]
  | string
  | URLSearchParams
  | undefined

type ConditionalResponse<
  R extends unknown,
  Raw extends boolean,
> = Raw extends true ? Response | void : R | void

export async function handleResponse<
  R extends unknown = unknown,
  I extends unknown = unknown,
  Raw extends boolean = false,
>({
  response,
  toast,
  serializer,
  navigate,
  currentUrl,
  returnRaw = false as Raw,
  onSuccess,
  onFail,
}: {
  response: Response
  returnRaw?: Raw
  toast?: ReturnType<typeof useToast>['toast']
  navigate?: ReturnType<typeof useNavigate>
  currentUrl?: string
  serializer?: (item: I) => R
  onSuccess?: (data: ConditionalResponse<R, Raw>) => void
  onFail?: (error: string) => void
}): Promise<ConditionalResponse<R, Raw>> {
  if (response.ok) {
    if (returnRaw === true) return response as ConditionalResponse<R, Raw>

    const json = await response.json()
    const data = serializer
      ? (serializer(json) as ConditionalResponse<R, Raw>)
      : (json as ConditionalResponse<R, Raw>)
    onSuccess?.(data)

    return data
  }

  if (response.status === 401 || response.status === 403) {
    toast?.({
      title: 'You are being redirected...',
      description:
        'You are not authorized to access this resource, redirecting your to the login page',
    })

    if (currentUrl && !currentUrl.includes(ROUTES.auth.login)) {
      navigate?.push(
        `${ROUTES.auth.login}?returnTo=${encodeURIComponent(currentUrl)}`,
      )
    }
  } else if (response.status >= 500) {
    if (onFail) {
      onFail('Something went wrong on the server')
    } else {
      toast?.({
        title: 'Server error',
        description: 'Something went wrong on the server',
        variant: 'destructive',
      })
    }
  } else if (response.status !== 404) {
    const error = await response.json()
    if (onFail) {
      onFail(error.message)
    } else {
      toast?.({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    }
  }
}

export async function executeFetch<
  R extends unknown = unknown,
  I extends unknown = unknown,
  Raw extends boolean = false,
>({
  route,
  method = 'GET',
  abortSignal,
  body,
  searchParams,
  toast,
  serializer,
  navigate,
  currentUrl,
  onSuccess,
  onFail,
}: {
  route: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: Record<string, unknown> | null
  abortSignal?: AbortSignal
  searchParams?: ISearchParams
  toast?: ReturnType<typeof useToast>['toast']
  navigate?: ReturnType<typeof useNavigate>
  currentUrl?: string
  serializer?: (item: any) => any
  onSuccess?: (data: ConditionalResponse<R, Raw>) => void
  onFail?: (error: string) => void
}) {
  let response: Response
  try {
    response = await fetch(buildRoute(route, searchParams), {
      credentials: 'include',
      method,
      signal: abortSignal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : null,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }

    if (onFail) {
      onFail((error as Error).message)
    } else {
      toast?.({
        title: 'Error',
        description: (error as Error).message,
        variant: 'destructive',
      })
    }
    return
  }

  return handleResponse<R, I, Raw>({
    response,
    toast,
    navigate,
    currentUrl,
    serializer,
    onSuccess,
    onFail,
  })
}

export default function useFetcher<
  R extends unknown = unknown,
  I extends unknown = unknown,
  Raw extends boolean = false,
>(
  route?: string,
  {
    fallback = [], // TODO: Fallback should not default to []. Some data fetching may expect an object instead of an array.
    serializer,
    searchParams,
    onSuccess,
    onFail,
  }: {
    fallback?: any
    serializer?: (item: I) => R
    searchParams?: ISearchParams
    onSuccess?: (data: ConditionalResponse<R, Raw>) => void
    onFail?: (error: string) => void
  } = { fallback: [] },
) {
  const { toast } = useToast()
  const navigate = useNavigate()

  return useCallback(async () => {
    if (!route) return fallback as R

    const currentUrl = window.location.href

    const response = await executeFetch<R, I, Raw>({
      route,
      searchParams,
      toast,
      serializer,
      navigate,
      currentUrl,
      onSuccess,
      onFail,
    })
    return response as R
  }, [
    route,
    searchParams,
    toast,
    serializer,
    onFail,
    onSuccess,
    navigate,
    fallback,
  ])
}

function buildRoute(route: string, searchParams?: ISearchParams) {
  if (!searchParams) return route

  const params = new URLSearchParams(searchParams)
  return route.toString() + '?' + params.toString()
}

export type UseFetcherArgs = Parameters<typeof useFetcher>
