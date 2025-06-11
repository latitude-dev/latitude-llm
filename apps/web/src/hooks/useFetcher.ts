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
  returnRaw = false as Raw,
  onSuccess,
  onFail,
}: {
  response: Response
  returnRaw?: Raw
  toast: ReturnType<typeof useToast>['toast']
  navigate: ReturnType<typeof useNavigate>
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
    toast({
      title: 'You are being redirected...',
      description:
        'You are not authorized to access this resource, redirecting your to the login page',
    })

    navigate.push(ROUTES.auth.login)
  } else if (response.status >= 500) {
    if (onFail) {
      onFail('Something went wrong on the server')
    } else {
      toast({
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
      toast({
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
  searchParams,
  toast,
  serializer,
  navigate,
  onSuccess,
  onFail,
}: {
  route: string
  searchParams?: ISearchParams
  toast: ReturnType<typeof useToast>['toast']
  navigate: ReturnType<typeof useNavigate>
  serializer?: (item: any) => any
  onSuccess?: (data: ConditionalResponse<R, Raw>) => void
  onFail?: (error: string) => void
}) {
  const response = await fetch(buildRoute(route, searchParams), {
    credentials: 'include',
  })
  return handleResponse<R, I, Raw>({
    response,
    toast,
    navigate,
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
    fallback = [],
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

    const response = executeFetch<R, I, Raw>({
      route,
      searchParams,
      toast,
      serializer,
      navigate,
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
