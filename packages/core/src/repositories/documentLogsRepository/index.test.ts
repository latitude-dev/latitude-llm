import { RunErrorCodes } from '@latitude-data/constants/errors'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  Commit,
  DocumentVersion,
  ErrorableEntity,
  Providers,
  Workspace,
} from '../../browser'
import {
  createDocumentLog,
  createProject,
  helpers,
} from '../../tests/factories'
import { createRunError } from '../../tests/factories/runErrors'
import { DocumentLogsRepository } from './index'

let workspace: Workspace
let commit: Commit
let document: DocumentVersion

describe('DocumentLogsRepository', () => {
  describe('findAll', () => {
    beforeEach(async () => {
      const {
        workspace: wps,
        documents: [doc],
        commit: cmt,
      } = await createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          foo: helpers.createPrompt({
            provider: 'openai',
          }),
        },
      })
      workspace = wps
      commit = cmt
      document = doc!
      await createDocumentLog({ document, commit })
    })

    it('returns document logs scoped by workspace', async () => {
      const {
        documents: [document2],
        commit: commit2,
      } = await createProject({
        providers: [{ type: Providers.OpenAI, name: 'openai' }],
        documents: {
          bar: helpers.createPrompt({
            provider: 'openai',
          }),
        },
      })

      await createDocumentLog({ document: document2!, commit: commit2 })

      const repo = new DocumentLogsRepository(workspace.id)
      const data = await repo.findAll().then((r) => r.unwrap())
      expect(data.length).toBe(1)
    })

    it('does not return document logs with errors', async () => {
      const { documentLog } = await createDocumentLog({ document, commit })
      await createRunError({
        errorableType: ErrorableEntity.DocumentLog,
        errorableUuid: documentLog.uuid,
        code: RunErrorCodes.Unknown,
        message: 'Error message',
      })

      const repo = new DocumentLogsRepository(workspace.id)
      const data = await repo.findAll().then((r) => r.unwrap())
      expect(data.length).toBe(1)
    })
  })
})
