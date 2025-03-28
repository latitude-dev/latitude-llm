import { useMemo, useCallback } from 'react'
import { useToast } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'

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
  Raw extends boolean = false,
  I extends unknown = unknown,
  R extends unknown = unknown,
>({
  response,
  toast,
  serializer,
  navigate,
  returnRaw = false as Raw,
}: {
  response: Response
  returnRaw?: Raw
  toast: ReturnType<typeof useToast>['toast']
  navigate: ReturnType<typeof useNavigate>
  serializer?: (item: I) => R
}): Promise<ConditionalResponse<R, Raw>> {
  if (response.ok) {
    if (returnRaw === true) return response as ConditionalResponse<R, Raw>

    const json = await response.json()
    return serializer
      ? (serializer(json) as ConditionalResponse<R, Raw>)
      : (json as ConditionalResponse<R, Raw>)
  }

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
}

export async function executeFetch<
  Raw extends boolean = false,
  I extends unknown = unknown,
  R extends unknown = unknown,
>({
  route,
  searchParams,
  toast,
  serializer,
  navigate,
}: {
  route: string
  searchParams?: ISearchParams
  toast: ReturnType<typeof useToast>['toast']
  serializer?: (item: any) => any
  navigate: ReturnType<typeof useNavigate>
}) {
  const response = await fetch(buildRoute(route, searchParams), {
    credentials: 'include',
  })
  return handleResponse<Raw, I, R>({
    response,
    toast,
    navigate,
    serializer,
  })
}

export default function useFetcher<
  Raw extends boolean = false,
  I extends unknown = unknown,
  R extends unknown = unknown,
>(
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

  return useCallback(async () => {
    if (!route) return fallback

    return executeFetch<Raw, I, R>({
      route,
      searchParams,
      toast,
      serializer,
      navigate,
    })
  }, [route, searchParams, toast, serializer, navigate])
}

function buildRoute(route: string, searchParams?: ISearchParams) {
  if (!searchParams) return route

  const params = new URLSearchParams(searchParams)
  return route.toString() + '?' + params.toString()
}

export type UseFetcherArgs = Parameters<typeof useFetcher>
