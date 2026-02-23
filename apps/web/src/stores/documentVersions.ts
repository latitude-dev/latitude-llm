'use client'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

import { useCallback, useMemo } from 'react'

import useFetcher from '$/hooks/useFetcher'
import { assignDatasetAction } from '$/actions/documents/assignDatasetAction'
import { saveLinkedDatasetAction } from '$/actions/documents/saveLinkedDatasetAction'
import { createDocumentVersionAction } from '$/actions/documents/create'
import { destroyDocumentAction } from '$/actions/documents/destroyDocumentAction'
import { destroyFolderAction } from '$/actions/documents/destroyFolderAction'
import { renameDocumentPathsAction } from '$/actions/documents/renamePathsAction'
import { uploadDocumentAction } from '$/actions/documents/upload'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useRouter } from 'next/navigation'
import useSWR, { SWRConfiguration } from 'swr'
import {
  HEAD_COMMIT,
  MAX_SIZE,
  MAX_UPLOAD_SIZE_IN_MB,
} from '@latitude-data/core/constants'

const EMPTY_DATA = [] as DocumentVersion[]

export default function useDocumentVersions(
  {
    commitUuid = HEAD_COMMIT,
    projectId,
  }: { commitUuid?: string; projectId?: number } = { commitUuid: HEAD_COMMIT },
  opts: SWRConfiguration & {
    onSuccessCreate?: (document: DocumentVersion) => void
  } = {},
) {
  const { toast } = useToast()
  const { onSuccessCreate } = opts
  const enabled = !!projectId && !!commitUuid
  const fetcher = useFetcher<DocumentVersion[]>(
    enabled
      ? ROUTES.api.projects.detail(projectId).commits.detail(commitUuid).root
      : undefined,
    {
      fallback: EMPTY_DATA,
    },
  )
  const {
    mutate,
    data = EMPTY_DATA,
    isValidating,
    isLoading,
    error: swrError,
  } = useSWR<DocumentVersion[]>(
    enabled ? ['documentVersions', projectId, commitUuid] : undefined,
    fetcher,
    opts,
  )

  const router = useRouter()
  const { execute: executeCreateDocument } = useLatitudeAction(
    createDocumentVersionAction,
    {
      onSuccess: ({ data: document }) => {
        onSuccessCreate?.(document)
      },
    },
  )
  const { execute: executeUploadDocument } = useLatitudeAction(
    uploadDocumentAction,
    {
      onSuccess: ({ data: document }) => {
        onSuccessCreate?.(document)
      },
    },
  )
  const { execute: executeRenamePaths } = useLatitudeAction(
    renameDocumentPathsAction,
  )
  const { execute: executeDestroyDocument, isPending: isDestroyingFile } =
    useLatitudeAction(destroyDocumentAction)
  const { execute: executeDestroyFolder, isPending: isDestroyingFolder } =
    useLatitudeAction(destroyFolderAction)

  const createFile = useCallback(
    async ({
      path,
      agent,
      content,
    }: {
      path: string
      agent?: boolean
      content?: string
    }) => {
      if (!projectId) return

      const [document, error] = await executeCreateDocument({
        projectId,
        commitUuid,
        path,
        agent,
        content,
      })

      if (error) {
        toast({
          title: 'Error creating document',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
      } else if (document) {
        mutate((prev) => [...(prev || []), document])
        router.push(
          ROUTES.projects
            .detail({ id: projectId! })
            .commits.detail({ uuid: commitUuid })
            .documents.detail({ uuid: document.documentUuid }).root,
        )
      }
    },
    [executeCreateDocument, mutate, commitUuid, projectId, toast, router],
  )

  const uploadFile = useCallback(
    async ({ path, file }: { path: string; file: File }) => {
      if (!projectId) return

      if (file.size > MAX_UPLOAD_SIZE_IN_MB) {
        toast({
          title: 'Error uploading document',
          description: `Your file must be less than ${MAX_SIZE}MB in size. You can split it into smaller files and upload them separately.`,
          variant: 'destructive',
        })
        return
      }

      const [document, error] = await executeUploadDocument({
        path,
        projectId,
        commitUuid,
        file,
      })

      if (error) {
        toast({
          title: 'Error uploading document',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
        return
      }

      if (!document) return

      mutate((prev) => [...(prev || []), document])
      router.push(
        ROUTES.projects
          .detail({ id: projectId! })
          .commits.detail({ uuid: commitUuid })
          .documents.detail({ uuid: document.documentUuid }).root,
      )
    },
    [executeUploadDocument, mutate, commitUuid, projectId, toast, router],
  )

  const renamePaths = useCallback(
    async ({ oldPath, newPath }: { oldPath: string; newPath: string }) => {
      if (!projectId) return

      const [updatedDocuments, error] = await executeRenamePaths({
        oldPath,
        newPath,
        projectId,
        commitUuid,
      })

      if (updatedDocuments) {
        mutate((prev) =>
          (prev || []).map((d) => {
            const updatedDocument = updatedDocuments.find(
              (ud) => ud.documentUuid === d.documentUuid,
            )
            return updatedDocument ? updatedDocument : d
          }),
        )
      }

      if (error) {
        toast({
          title: 'Error renaming paths',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
      }
    },
    [executeRenamePaths, mutate, commitUuid, projectId, toast],
  )

  const destroyFile = useCallback(
    async (documentUuid: string) => {
      if (!projectId) return

      const [_, error] = await executeDestroyDocument({
        documentUuid,
        projectId,
        commitUuid,
      })
      if (error) {
        toast({
          title: 'Error deleting document',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
      } else {
        mutate((prev) => (prev || []).filter((d) => d.documentUuid !== documentUuid))
        toast({
          title: 'Success',
          description: 'Document deleted',
        })
        router.push(
          ROUTES.projects
            .detail({ id: projectId })
            .commits.detail({ uuid: commitUuid }).documents.root,
        )
      }
    },
    [executeDestroyDocument, mutate, commitUuid, projectId, router, toast],
  )

  const destroyFolder = useCallback(
    async (path: string) => {
      if (!projectId) return

      const [_, error] = await executeDestroyFolder({
        projectId,
        commitUuid,
        path,
      })

      if (error) {
        toast({
          title: 'Error deleting folder',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
      } else {
        await mutate()

        toast({
          title: 'Success',
          description: 'Folder deleted',
        })
        router.push(
          ROUTES.projects
            .detail({ id: projectId })
            .commits.detail({ uuid: commitUuid }).documents.root,
        )
      }
    },
    [executeDestroyFolder, mutate, commitUuid, projectId, router, toast],
  )

  const { execute: assignDataset, isPending: isAssigningDataset } =
    useLatitudeAction(assignDatasetAction, {
      onSuccess: useCallback(
        ({ data: document }: { data: DocumentVersion }) => {
          if (!document) return
          mutate()
        },
        [mutate],
      ),
    })

  const { execute: saveLinkedDataset, isPending: isLinkingDataset } =
    useLatitudeAction(saveLinkedDatasetAction, {
      onSuccess: useCallback(
        ({ data: document }: { data: DocumentVersion }) => {
          if (!document) return

          mutate((prev) =>
            (prev || []).map((d) =>
              d.documentUuid === document.documentUuid ? document : d,
            ),
          )
        },
        [mutate],
      ),
    })

  const mutateDocumentUpdated = useCallback(
    (document: DocumentVersion) => {
      mutate(
        (prev) => (prev || []).map((d) => (d.id === document.id ? document : d)),
        { revalidate: false },
      )
    },
    [mutate],
  )

  return useMemo(
    () => ({
      data,
      isValidating: isValidating,
      isLoading: isLoading,
      error: swrError,
      createFile,
      uploadFile,
      renamePaths,
      destroyFile,
      destroyFolder,
      assignDataset,
      saveLinkedDataset,
      mutate,
      mutateDocumentUpdated,
      isAssigning: isAssigningDataset || isLinkingDataset,
      isDestroying: isDestroyingFile || isDestroyingFolder,
    }),
    [
      data,
      isValidating,
      isLoading,
      swrError,
      createFile,
      uploadFile,
      renamePaths,
      destroyFile,
      destroyFolder,
      assignDataset,
      saveLinkedDataset,
      mutate,
      mutateDocumentUpdated,
      isAssigningDataset,
      isLinkingDataset,
      isDestroyingFile,
      isDestroyingFolder,
    ],
  )
}
