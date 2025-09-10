import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { claimedPromocodes } from '../../schema'
import { Promocode } from '../../browser'
import { GrantSource, Workspace } from '../../browser'
import { publisher } from '../../events/publisher'
import { issueGrant } from '../grants/issue'
import { BadRequestError } from '@latitude-data/constants/errors'
import { findByCode } from '../../data-access/promocodes'

export async function claimPromocode(
  {
    workspace,
    code,
  }: {
    workspace: Workspace
    code: string
  },
  transaction = new Transaction(),
): PromisedResult<Promocode> {
  return transaction.call<Promocode>(
    async (tx) => {
      const promocodeResult = await findByCode(code, tx)
      if (!Result.isOk(promocodeResult)) return promocodeResult
      const promocode = promocodeResult.unwrap()

      if (promocode.cancelledAt) {
        return Result.error(
          new BadRequestError(
            'Promocode has been expired and cannot be claimed',
          ),
        )
      }

      const [claimedPromocode] = await tx
        .insert(claimedPromocodes)
        .values({ workspaceId: workspace.id, code })
        .returning()

      if (!claimedPromocode) {
        return Result.error(new Error('Error claiming promocode'))
      }

      const issueGrantResult = await issueGrant(
        {
          type: promocode.quotaType,
          amount: promocode.amount,
          source: GrantSource.Promocode,
          referenceId: promocode.id.toString(),
          workspace,
        },
        transaction,
      )

      if (!Result.isOk(issueGrantResult)) {
        return issueGrantResult
      }

      return Result.ok(promocode)
    },
    (claimedPromocode) => {
      publisher.publishLater({
        type: 'promocodeClaimed',
        data: {
          workspaceId: workspace.id,
          promocode: claimedPromocode,
        },
      })
    },
  )
}
