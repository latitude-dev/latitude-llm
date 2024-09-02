import { Project } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { createProjectAction } from '$/actions/projects/create'
import { destroyProjectAction } from '$/actions/projects/destroy'
import { fetchProjectsAction } from '$/actions/projects/fetch'
import { updateProjectAction } from '$/actions/projects/update'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import useSWR, { SWRConfiguration } from 'swr'

export default function useProjects(opts?: SWRConfiguration) {
  const { toast } = useToast()
  const fetcher = async () => {
    const [data, error] = await fetchProjectsAction()
    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    }
    if (!data) return []

    return data
  }

  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<Project[]>('api/projects', fetcher, opts)
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

  return { data, mutate, create, update, destroy, ...rest }
}
