'use client'

import { createProjectAction } from '$/actions/projects/create'
import { destroyProjectAction } from '$/actions/projects/destroy'
import { updateProjectAction } from '$/actions/projects/update'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import { Project } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useCallback } from 'react'
import useSWR from 'swr'

export default function useProjects() {
  const { toast } = useToast()
  const fetcher = useFetcher<Project[]>(ROUTES.api.projects.root)

  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<Project[]>('api/projects', fetcher)
  const { execute: create } = useLatitudeAction(createProjectAction, {
    onSuccess: ({ data: project }) => {
      toast({
        title: 'Success',
        description: `${project.name} created successfully`,
      })

      mutate([...data, project])
    },
  })
  const { execute: update } = useLatitudeAction(updateProjectAction, {
    onSuccess: ({ data: project }) => {
      toast({
        title: 'Project updated',
        description: `${project.name} has been updated successfully`,
      })

      mutate(data.map((p) => (p.id === project.id ? project : p)))
    },
    onError: (error) => {
      toast({
        title: 'Error',
        variant: 'destructive',
        description: error.err.message,
      })
    },
  })
  const { execute: destroy } = useLatitudeAction(destroyProjectAction, {
    onSuccess: ({ data: project }) => {
      toast({
        title: 'Success',
        description: `${project.name} destroyed successfully`,
      })

      mutate(data.filter((p) => p.id !== project.id))
    },
  })

  const onMessage = useCallback(
    (args: EventArgs<'projectUpdated'>) => {
      mutate(
        (prev) =>
          (prev || []).map((p) =>
            p.id === args.project.id ? args.project : p,
          ),
        { revalidate: false },
      )
    },
    [mutate],
  )
  useSockets({ event: 'projectUpdated', onMessage })

  return { data, mutate, create, update, destroy, ...rest }
}
