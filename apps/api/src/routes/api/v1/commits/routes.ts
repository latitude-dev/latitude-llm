import { materializeDocumentsAtCommit, Node, toTree } from '@latitude-data/core'
import HttpStatusCodes from '$src/common/HttpStatusCodes'
import { BadRequestError, NotFoundError } from '$core/lib/errors'
import { Request, Response } from 'express'

function findNode({ rootNode, path }: { rootNode: Node; path: string }) {
  const pathParts = path.split('/')

  let currentNode = rootNode
  let currentPart = pathParts.shift()
  while (currentPart) {
    const child = currentNode.children.find(
      // NOTE: sanitaze name before comparing
      (child) => child.doc?.name === currentPart,
    )
    if (!child) return null

    currentNode = child
    currentPart = pathParts.shift()
  }

  return currentNode
}

export async function promptRoute(req: Request, res: Response) {
  const commitUuid = req.params.commitUuid
  const path = req.params[0]
  if (!path) throw new BadRequestError('Invalid prompt path')

  const result = await materializeDocumentsAtCommit({ commitUuid: commitUuid! })
  const rootNode = toTree(result.unwrap())
  const node = findNode({ rootNode, path })

  if (!node) {
    throw new NotFoundError('Prompt not found')
  } else {
    return res.status(HttpStatusCodes.OK).json(node.doc)
  }
}
