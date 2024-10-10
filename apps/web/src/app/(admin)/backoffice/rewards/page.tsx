'use client'

import { RewardType } from '@latitude-data/core/browser'
import {
  Button,
  ClickToCopy,
  Icon,
  IconName,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWithHeader,
  Text,
  useToast,
} from '@latitude-data/web-ui'
import usePendingRewardClaims from '$/stores/pendingRewardClaims'
import Link from 'next/link'

function ReferenceCell({
  reference,
  type,
}: {
  reference: string
  type: RewardType
}) {
  if ([RewardType.Post, RewardType.GithubIssue].includes(type)) {
    return (
      <Link href={reference}>
        <Button variant='link' className='p-0'>
          <Text.H5 noWrap ellipsis color='primary'>
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

const REWARD_TITLES: Record<RewardType, string> = {
  [RewardType.GithubStar]: 'Github Star',
  [RewardType.Follow]: 'Follow on X or LinkedIn',
  [RewardType.Post]: 'Post on X or LinkedIn',
  [RewardType.GithubIssue]: 'Solve a Github Issue',
  [RewardType.Referral]: 'Referral',
  [RewardType.SignupLaunchDay]: 'Signed up on Launch Day',
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
      <Text.H6 color='foregroundMuted'> (+{rewardAmount / 1000}k)</Text.H6>
      <Text.H6>{REWARD_TITLES[type]}</Text.H6>
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
    const { dismiss } = toast({
      title: `Claim ${isValid ? 'accepted' : 'rejected'}`,
      description: `The claim has been ${isValid ? 'accepted' : 'rejected'}`,
      action: (
        <Button
          variant='outline'
          onClick={() => {
            updateRewardClaim({ claimId, isValid: null })
            dismiss()
          }}
        >
          <Icon name='undo' />
          Undo
        </Button>
      ),
    })
  }

  return (
    <div className='w-full max-w-[1250px] m-auto px-4 py-8 pt-0 flex flex-col gap-8'>
      <div className='w-full flex flex-row align-center justify-end gap-2'>
        <LinkButton
          label='Star gazers'
          href='https://github.com/latitude-dev/latitude-llm/stargazers'
          icon='star'
        />
        <LinkButton
          label='X Followers'
          href='https://x.com/trylatitude/followers'
          icon='twitter'
        />
        <LinkButton
          label='Pull Requests'
          href='https://github.com/latitude-dev/latitude-llm/pulls'
          icon='github'
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
