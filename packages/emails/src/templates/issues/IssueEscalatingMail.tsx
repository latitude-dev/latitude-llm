import React from 'react'

import { Column, Row, Section } from '@react-email/components'
import { DotIndicator } from '@latitude-data/web-ui/atoms/DotIndicator'
import ContainerLayout from '../../components/ContainerLayout'
import NotificationsFooter from '../../components/NotificationsFooter'
import { NotificiationsLayoutProps } from '../../types'
import { Button } from '../../components/Button'
import { Text } from '../../components/Text'

export type IssueEscalatingMailProps = {
  issueTitle: string
  link: string
  currentWorkspace: NotificiationsLayoutProps['currentWorkspace']
  issue: {
    title: string
    eventsCount: number
    histogram: { date: string; count: number }[]
  }
}

function EscalatingBadge() {
  return (
    <div className='inline-block leading-4 rounded-full bg-destructive-muted px-2 py-0.5'>
      <div className='inline-block mr-1 align-middle leading-4'>
        <DotIndicator variant='destructive' className='align-middle' />
      </div>
      <div className='inline-block align-middle'>
        <Text.H6M color='destructiveMuted'>Escalating</Text.H6M>
      </div>
    </div>
  )
}

function MiniHistogram({ data }: { data: { date: string; count: number }[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1)
  const BAR_HEIGHT = 32 // pixels

  return (
    <>
      {/* Dotted line row with max count */}
      <table cellPadding='0' cellSpacing='0' className='w-full border-0'>
        <tbody>
          <tr>
            <td className='w-full'>
              <div className='border-t border-dashed border-border border-b-0 align-middle' />
            </td>

            <td className='pl-2 whitespace-nowrap border-0 w-14'>
              <Text.H6 color='foregroundMuted'>{maxCount}</Text.H6>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Bars row */}
      <table
        cellPadding='0'
        cellSpacing='0'
        className='w-full pt-1 border-0'
        style={{ height: `${BAR_HEIGHT}px` }}
      >
        <tbody>
          <tr className='align-bottom'>
            {data.map((item, index) => {
              const ratio = maxCount > 0 ? item.count / maxCount : 0
              const barHeight =
                item.count > 0 ? Math.max(ratio * BAR_HEIGHT, 2) : 1
              const hasCount = item.count > 0

              return (
                <td
                  key={`${item.date}-${index}`}
                  className='align-bottom border-0 w-3 pr-0.5'
                >
                  <div
                    className={`w-full rounded-t-[1px] ${
                      hasCount ? 'bg-destructive/50' : 'bg-border'
                    }`}
                    style={{
                      height: `${barHeight}px`,
                    }}
                  />
                </td>
              )
            })}
            <td className='pl-2 w-14'>
              <div className='opacity-0'>{maxCount}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  )
}

function IssueTableRow({
  issue,
}: {
  issue: IssueEscalatingMailProps['issue']
}) {
  return (
    <Section className='bg-destructive-muted border border-dashed border-destructive rounded-lg p-2'>
      <Section className='bg-white rounded-lg border border-border'>
        <Row className='bg-secondary rounded-t-lg border-b border-b-border'>
          <Column className='px-4 py-2 w-72'>
            <Text.H5B>Issue</Text.H5B>
          </Column>
          <Column className='px-4 py-2 w-10'>
            <Text.H5B>Events</Text.H5B>
          </Column>
          <Column className='px-4 py-2 w-72'>
            <table cellPadding='0' cellSpacing='0' width='100%'>
              <tbody>
                <tr>
                  <td>
                    <Text.H5B>Trend</Text.H5B>
                  </td>
                  <td align='right'>
                    <Text.H5B>30D</Text.H5B>
                  </td>
                </tr>
              </tbody>
            </table>
          </Column>
        </Row>
        <Row>
          <Column className='px-4 py-2 w-72'>
            <Text.H5 display='block'>{issue.title}</Text.H5>
            <div className='mt-1'>
              <EscalatingBadge />
            </div>
          </Column>
          <Column className='px-4 py-2 w-10'>
            <Text.H5>{issue.eventsCount}</Text.H5>
          </Column>
          <Column className='px-4 py-2 w-72'>
            <MiniHistogram data={issue.histogram} />
          </Column>
        </Row>
      </Section>
    </Section>
  )
}

export default function IssueEscalatingMail({
  issueTitle,
  link,
  currentWorkspace,
  issue,
}: IssueEscalatingMailProps) {
  return (
    <ContainerLayout
      previewText={`Issue "${issueTitle}" is escalating.`}
      footer={<NotificationsFooter currentWorkspace={currentWorkspace} />}
    >
      <Section className='mb-2'>
        <Text.H2B color='destructiveMuted'>{issueTitle}</Text.H2B>{' '}
        <Text.H2B>started escalating</Text.H2B>
      </Section>
      <Text.H5 display='block' color='foregroundMuted'>
        You’re seeing this alert because this issue triggered in the last 24
        hours, it has triggered at least 20 times in the last 7 days, and in the
        last day, it’s been triggering about twice as often as it did over the
        past week.
      </Text.H5>

      <Section className='mt-9 mb-6'>
        <IssueTableRow issue={issue} />
      </Section>

      <Button href={link}>Review Issue</Button>
    </ContainerLayout>
  )
}

const EXAMPLE_ISSUE_TITLE = 'Incorrect JSON formatting'
// cd packages/core && pnpm email:dev for checking the UI
IssueEscalatingMail.PreviewProps = {
  issueTitle: EXAMPLE_ISSUE_TITLE,
  link: 'https://example.com',
  currentWorkspace: { id: 1, name: 'Acme Corp' },
  issue: {
    title: EXAMPLE_ISSUE_TITLE,
    eventsCount: 60,
    histogram: [
      {
        date: '2025-10-26',
        count: 0,
      },
      {
        date: '2025-10-27',
        count: 0,
      },
      {
        date: '2025-10-28',
        count: 0,
      },
      {
        date: '2025-10-29',
        count: 0,
      },
      {
        date: '2025-10-30',
        count: 0,
      },
      {
        date: '2025-10-31',
        count: 0,
      },
      {
        date: '2025-11-01',
        count: 0,
      },
      {
        date: '2025-11-02',
        count: 0,
      },
      {
        date: '2025-11-03',
        count: 0,
      },
      {
        date: '2025-11-04',
        count: 0,
      },
      {
        date: '2025-11-05',
        count: 0,
      },
      {
        date: '2025-11-06',
        count: 5,
      },
      {
        date: '2025-11-07',
        count: 5,
      },
      {
        date: '2025-11-08',
        count: 5,
      },
      {
        date: '2025-11-09',
        count: 5,
      },
      {
        date: '2025-11-10',
        count: 5,
      },
      {
        date: '2025-11-11',
        count: 5,
      },
      {
        date: '2025-11-12',
        count: 5,
      },
      {
        date: '2025-11-13',
        count: 1,
      },
      {
        date: '2025-11-14',
        count: 1,
      },
      {
        date: '2025-11-15',
        count: 1,
      },
      {
        date: '2025-11-16',
        count: 1,
      },
      {
        date: '2025-11-17',
        count: 1,
      },
      {
        date: '2025-11-18',
        count: 1,
      },
      {
        date: '2025-11-19',
        count: 3,
      },
      {
        date: '2025-11-20',
        count: 12,
      },
      {
        date: '2025-11-21',
        count: 1,
      },
      {
        date: '2025-11-22',
        count: 0,
      },
      {
        date: '2025-11-23',
        count: 0,
      },
      {
        date: '2025-11-24',
        count: 1,
      },
    ],
  },
} satisfies IssueEscalatingMailProps
