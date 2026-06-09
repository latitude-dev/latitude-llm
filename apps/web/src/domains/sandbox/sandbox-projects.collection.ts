import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  addProductionProjectToSandbox,
  createSandboxOnlyProject,
  listAttachableParentProjects,
  listSandboxProjects,
} from "./sandbox-projects.functions.ts"

const sandboxProjectsQueryKey = (sandboxOrgId: string) => ["sandbox-projects", sandboxOrgId] as const
const attachableParentProjectsQueryKey = (sandboxOrgId: string) =>
  ["sandbox-attachable-projects", sandboxOrgId] as const

/** Projects that live inside a sandbox (linked + sandbox-only). */
export function useSandboxProjects(sandboxOrgId: string) {
  return useQuery({
    queryKey: sandboxProjectsQueryKey(sandboxOrgId),
    queryFn: () => listSandboxProjects({ data: { sandboxOrgId } }),
    staleTime: 30_000,
  })
}

/** Parent-org projects available to attach, each flagged if already attached. */
export function useAttachableParentProjects(sandboxOrgId: string, enabled = true) {
  return useQuery({
    queryKey: attachableParentProjectsQueryKey(sandboxOrgId),
    queryFn: () => listAttachableParentProjects({ data: { sandboxOrgId } }),
    staleTime: 30_000,
    enabled,
  })
}

/** Attach (linked) and sandbox-only project creation, both refreshing the sandbox project lists. */
export function useSandboxProjectMutations(sandboxOrgId: string) {
  const queryClient = useQueryClient()
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: sandboxProjectsQueryKey(sandboxOrgId) }),
      queryClient.invalidateQueries({ queryKey: attachableParentProjectsQueryKey(sandboxOrgId) }),
    ])

  const attachProduction = useMutation({
    mutationFn: (productionProjectId: string) =>
      addProductionProjectToSandbox({ data: { sandboxOrgId, productionProjectId } }),
    onSuccess: invalidate,
  })

  const createSandboxOnly = useMutation({
    mutationFn: (name: string) => createSandboxOnlyProject({ data: { sandboxOrgId, name } }),
    onSuccess: invalidate,
  })

  return { attachProduction, createSandboxOnly }
}
