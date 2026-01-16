'use client'
import usePendingRewardClaims from '$/stores/admin/pendingRewardClaims'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import Link from 'next/link'
import { RewardType } from '@latitude-data/core/constants'
import { REWARD_CONFIGS } from './_components/RewardsConfigs'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'

const LINKABLE_REWARDS = [
  RewardType.XPost,
  RewardType.LinkedInPost,
  RewardType.AgentShare,
]

function ReferenceCell({
  reference,
  type,
}: {
  reference: string
  type: RewardType
}) {
  if (LINKABLE_REWARDS.includes(type)) {
    return (
      <Link href={reference} target='_blank'>
        <Button variant='link' className='p-0'>
          <Text.H5 noWrap ellipsis color='accentForeground'>
            {reference}
          </Text.H5>
          <Icon name='externalLink' />
        </Button>
      </Link>
    )
  }

  return (
    <ClickToCopy copyValue={reference}>
      <Text.H5 noWrap ellipsis>
        {reference}
      </Text.H5>
    </ClickToCopy>
  )
}

function RewardTypeCell({
  type,
  rewardAmount,
}: {
  type: RewardType
  rewardAmount: number
}) {
  return (
    <div className='flex flex-row items-center gap-2'>
      <Text.H6 color='foregroundMuted'> (+{rewardAmount})</Text.H6>
      <Text.H6>{REWARD_CONFIGS[type].title}</Text.H6>
    </div>
  )
}

function ValidateButtons({
  claimId,
  updateRewardClaim,
}: {
  claimId: number
  updateRewardClaim: (_: { claimId: number; isValid: boolean }) => void
}) {
  return (
    <div className='flex flex-row gap-2'>
      <Button
        variant='outline'
        onClick={() => updateRewardClaim({ claimId, isValid: true })}
      >
        <Icon name='thumbsUp' />
      </Button>
      <Button
        variant='outline'
        onClick={() => updateRewardClaim({ claimId, isValid: false })}
      >
        <Icon name='thumbsDown' />
      </Button>
    </div>
  )
}

function LinkButton({
  label,
  href,
  icon,
}: {
  label: string
  href: string
  icon: IconName
}) {
  return (
    <Link href={href} target='_blank'>
      <Button variant='outline' className='w-fit' iconProps={{ name: icon }}>
        {label}
        <Icon name='externalLink' />
      </Button>
    </Link>
  )
}

export default function AdminPage() {
  const { data: pendingClaims, updateRewardClaim } = usePendingRewardClaims()
  const { toast } = useToast()

  const handleUpdateRewardClaim = ({
    claimId,
    isValid,
  }: {
    claimId: number
    isValid: boolean
  }) => {
    updateRewardClaim({ claimId, isValid })
    toast({
      title: `Claim ${isValid ? 'accepted' : 'rejected'}`,
      description: `The claim has been ${isValid ? 'accepted' : 'rejected'}`,
    })
  }

  return (
    <div className='w-full max-w-[1250px] m-auto px-4 py-8 pt-0 flex flex-col gap-8'>
      <Alert
        variant='warning'
        title='Rewards DEPRECATED'
        description='We are not showing rewards inside the application anymore. Talk with Cesar. Rewards badge in the app header was replaced by Trial days left Badge when we introduced trials.'
      />
      <div className='w-full flex flex-row align-center justify-end gap-2'>
        <LinkButton
          label='X Followers'
          href='https://x.com/trylatitude/followers'
          icon='twitter'
        />
        <LinkButton
          label='LinkedIn Followers'
          href='https://www.linkedin.com/company/trylatitude/'
          icon='linear'
        />
        <LinkButton
          label='Star gazers'
          href='https://github.com/latitude-dev/latitude-llm/stargazers'
          icon='star'
        />
        <LinkButton
          label='Product Hunt Launch'
          href='https://www.producthunt.com/products/latitude-4'
          icon='rocket'
        />
      </div>
      <TableWithHeader
        title='Pending claims'
        table={
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim time</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Reward Type</TableHead>
                <TableHead>User input</TableHead>
                <TableHead>Validate</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingClaims.map((rewardClaim) => (
                <TableRow
                  key={rewardClaim.id}
                  className='border-b-[0.5px] h-12 max-h-12 border-border'
                >
                  <TableCell>
                    <Text.H5 noWrap>
                      {rewardClaim.createdAt.toLocaleString()}
                    </Text.H5>
                  </TableCell>
                  <TableCell>
                    <Text.H5 noWrap>
                      {rewardClaim.workspaceName ?? 'Deleted workspace'}
                    </Text.H5>
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-col py-2'>
                      <Text.H5 noWrap>
                        {rewardClaim.userName ?? 'Deleted user'}
                      </Text.H5>
                      <Text.H5 noWrap color='foregroundMuted'>
                        {rewardClaim.userEmail ?? 'Deleted user'}
                      </Text.H5>
                    </div>
                  </TableCell>
                  <TableCell>
                    <RewardTypeCell
                      type={rewardClaim.rewardType}
                      rewardAmount={rewardClaim.value}
                    />
                  </TableCell>
                  <TableCell>
                    <ReferenceCell
                      reference={rewardClaim.reference}
                      type={rewardClaim.rewardType}
                    />
                  </TableCell>
                  <TableCell>
                    <ValidateButtons
                      claimId={rewardClaim.id}
                      updateRewardClaim={handleUpdateRewardClaim}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        }
      />
    </div>
  )
}
