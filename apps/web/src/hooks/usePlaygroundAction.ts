'use client'

import { ROUTES } from '$/services/routes'
import type { Commit, DocumentVersion, Project } from '@latitude-data/core/browser'
import { AppLocalStorage, useLocalStorage } from '@latitude-data/web-ui/hooks/useLocalStorage'
import { omit } from 'lodash-es'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState } from 'react'

export enum PlaygroundAction {
  RefinePrompt = 'refinePrompt',
  RunLatte = 'runLatte',
}

export type PlaygroundActionPayload = {
  [PlaygroundAction.RefinePrompt]: {
    evaluationUuid: string
    resultUuids: string[]
  }
  [PlaygroundAction.RunLatte]: {
    prompt: string
  }
}

type playgroundAction<A extends PlaygroundAction = PlaygroundAction> = {
  action: A
  payload: PlaygroundActionPayload[A]
  projectId: number
  commitUuid: string
  documentUuid?: string
}
type PlaygroundActions = { [key: string]: playgroundAction }

export function usePlaygroundAction<A extends PlaygroundAction = PlaygroundAction>({
  action: actionType,
  project,
  commit,
  document,
}: {
  action: A
  project: Pick<Project, 'id'>
  commit: Pick<Commit, 'uuid'>
  document?: Pick<DocumentVersion, 'commitId' | 'documentUuid'>
}) {
  const navigate = useRouter()

  const base = ROUTES.projects.detail({ id: project.id }).commits.detail({ uuid: commit.uuid })
  const route = document
    ? base.documents.detail({ uuid: document.documentUuid }).root
    : base.preview.root

  const { value: playgroundActions, setValue: setPlaygroundActions } =
    useLocalStorage<PlaygroundActions>({
      key: AppLocalStorage.playgroundActions,
      defaultValue: {},
    })

  const actionId = useSearchParams().get('actionId')
  const [action, setAction] = useState<PlaygroundActionPayload[A] | undefined>(
    actionId &&
      playgroundActions[actionId]?.action === actionType &&
      playgroundActions[actionId]?.projectId === project.id &&
      playgroundActions[actionId]?.commitUuid === commit.uuid &&
      playgroundActions[actionId]?.documentUuid === document?.documentUuid
      ? (playgroundActions[actionId]!.payload as PlaygroundActionPayload[A])
      : undefined,
  )

  const setPlaygroundAction = useCallback(
    (payload: PlaygroundActionPayload[A]) => {
      const actionId = Math.random().toString(36).substring(2, 10)
      setPlaygroundActions({
        ...playgroundActions,
        [actionId]: {
          action: actionType,
          payload: payload,
          projectId: project.id,
          commitUuid: commit.uuid,
          documentUuid: document?.documentUuid,
        },
      })
      const query = new URLSearchParams({ actionId })
      navigate.push(`${route}?${query.toString()}`)
    },
    [
      playgroundActions,
      setPlaygroundActions,
      actionType,
      project,
      commit,
      document,
      navigate,
      route,
    ],
  )

  const resetPlaygroundAction = useCallback(() => {
    const clean = !!action && !!actionId
    setAction(undefined)
    if (clean) setPlaygroundActions(omit(playgroundActions, actionId))
    navigate.replace(route)
  }, [action, actionId, playgroundActions, setPlaygroundActions, navigate, route])

  return {
    playgroundAction: action,
    setPlaygroundAction,
    resetPlaygroundAction,
  }
}

export function useDeferredPlaygroundAction() {
  const navigate = useRouter()

  const { value: playgroundActions, setValue: setPlaygroundActions } =
    useLocalStorage<PlaygroundActions>({
      key: AppLocalStorage.playgroundActions,
      defaultValue: {},
    })

  const setPlaygroundAction = useCallback(
    <A extends PlaygroundAction = PlaygroundAction>({
      action: actionType,
      payload,
      project,
      commit,
      document,
    }: {
      action: A
      payload: PlaygroundActionPayload[A]
      project: Pick<Project, 'id'>
      commit: Pick<Commit, 'uuid'>
      document?: Pick<DocumentVersion, 'commitId' | 'documentUuid'>
    }) => {
      const actionId = Math.random().toString(36).substring(2, 10)
      setPlaygroundActions({
        ...playgroundActions,
        [actionId]: {
          action: actionType,
          payload: payload,
          projectId: project.id,
          commitUuid: commit.uuid,
          documentUuid: document?.documentUuid,
        },
      })
      const base = ROUTES.projects.detail({ id: project.id }).commits.detail({ uuid: commit.uuid })
      const route = document
        ? base.documents.detail({ uuid: document.documentUuid }).root
        : base.preview.root
      const query = new URLSearchParams({ actionId })
      navigate.push(`${route}?${query.toString()}`)
    },
    [playgroundActions, setPlaygroundActions, navigate],
  )

  return {
    setPlaygroundAction,
  }
}
