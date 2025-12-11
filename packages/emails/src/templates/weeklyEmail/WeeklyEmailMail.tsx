import React from 'react'

import { Column, Link, Row, Section } from '@react-email/components'
import { formatCount } from '@latitude-data/constants/formatCount'
import ContainerLayout from '../../components/ContainerLayout'
import NotificationsFooter from '../../components/NotificationsFooter'
import { Text } from '../../components/Text'
import { Button } from '../../components/Button'
import {
  fullActivityProfile,
  // logsOnlyProfile,
  // someActivityProfile,
  // issuesWithoutNewProfile,
  // zeroActivityProfile,
  // highVolumeProfile,
} from './previewData'
import {
  WeeklyEmailMailProps,
  LogStats,
  IssueStats,
  AnnotationStats,
} from './types'
import { EMAIL_ROUTES } from '../../routes'
import { cn } from '@latitude-data/web-ui/utils'

const INTEGRATION_DOCS_URL =
  'https://docs.latitude.so/guides/integration/overview'

const ISSUES_VIDEO_URL = 'https://www.youtube.com/watch?v=trOwCWaIAZk'

function BlankSlateCard({
  title,
  description,
  link,
  type,
}: {
  type: 'primary' | 'secondary'
  title: string
  description: string
  link: { label: string; href: string; imgSrc?: string }
}) {
  return (
    <Section
      className={cn(
        'border-2 border-dashed border-primary rounded-lg py-3 px-4',
        {
          'bg-accent': type === 'primary',
          'bg-latte': type === 'secondary',
        },
      )}
    >
      <Text.H4M display='block'>{title}</Text.H4M>
      <Section className='mt-2'>
        <Text.H5 display='block'>{description}</Text.H5>
      </Section>
      <Section className='mt-4'>
        <Button href={link.href}>{link.label}</Button>
      </Section>
    </Section>
  )
}
function StatCard({
  title,
  value,
  subtitle,
  showSubtitleSpace = false,
}: {
  title: string
  value: string | number
  subtitle?: string
  showSubtitleSpace?: boolean
}) {
  return (
    <Section className='bg-secondary border border-border rounded-lg p-4'>
      <Section className='mb-1'>
        <Text.H6 color='foregroundMuted' display='block'>
          {title}
        </Text.H6>
      </Section>
      <Text.H2B display='block'>{value}</Text.H2B>
      {showSubtitleSpace && (
        <Section className='mt-1'>
          <Text.H6 color='foregroundMuted' display='block'>
            {subtitle || '\u00A0'}
          </Text.H6>
        </Section>
      )}
    </Section>
  )
}

function LogsSection({ logs }: { logs: LogStats }) {
  const noLogs = !logs.usedInProduction || logs.logsCount === 0
  return (
    <Section className='mt-8'>
      <Section className='mb-4'>
        <Text.H3B display='block'>Your usage</Text.H3B>
      </Section>

      <table cellPadding='0' cellSpacing='0' width='100%' className='mb-4'>
        <tbody>
          <tr>
            <td width='33%' className='pr-2'>
              <StatCard
                title='Total traces'
                value={formatCount(logs.logsCount)}
              />
            </td>
            <td width='33%' className='px-1'>
              <StatCard
                title='Tokens Used'
                value={formatCount(logs.tokensSpent)}
              />
            </td>
            <td width='33%' className='pl-2'>
              <StatCard
                title='Token Cost'
                value={`$${formatCount(logs.tokensCost, { decimalPlaces: 2 })}`}
              />
            </td>
          </tr>
        </tbody>
      </table>

      {logs.topProjects.length > 0 && (
        <Section className='bg-white border border-border rounded-lg overflow-hidden'>
          <Row className='bg-secondary border-b border-border'>
            <Column className='px-4 py-2 w-1/2'>
              <Text.H5B>Top Projects</Text.H5B>
            </Column>
            <Column className='px-4 py-2 w-1/4 text-right'>
              <Text.H5B>Traces</Text.H5B>
            </Column>
            <Column className='px-4 py-2 w-1/4 text-right'>
              <Text.H5B>Token Cost</Text.H5B>
            </Column>
          </Row>
          {logs.topProjects.slice(0, 5).map((project, index, array) => (
            <Row
              key={project.projectId}
              className={
                index === array.length - 1 ? '' : 'border-b border-border'
              }
            >
              <Column className='px-4 py-3 w-1/2'>
                <Link
                  href={
                    EMAIL_ROUTES.projects
                      .details(project.projectId)
                      .commits.details().issues.root
                  }
                >
                  <Text.H5 display='block' color='primary'>
                    {project.projectName}
                  </Text.H5>
                </Link>
              </Column>
              <Column className='px-4 py-3 w-1/4 text-right'>
                <Text.H5 color='foregroundMuted'>
                  {formatCount(project.logsCount)}
                </Text.H5>
              </Column>
              <Column className='px-4 py-3 w-1/4 text-right'>
                <Text.H5 color='foregroundMuted'>{`$${formatCount(project.tokensCost)}`}</Text.H5>
              </Column>
            </Row>
          ))}
        </Section>
      )}
      {noLogs ? (
        <BlankSlateCard
          type='primary'
          title='Latitude production'
          link={{ label: 'Integrate Latitude', href: INTEGRATION_DOCS_URL }}
          description="It looks like you haven't integrated Latitude into your production environment yet. To start tracking your AI follow our  integration guide."
        />
      ) : null}
    </Section>
  )
}

function IssuesSection({ issues }: { issues: IssueStats }) {
  const hasNewIssues = issues.newIssuesCount > 0
  const hasProjects = issues.topProjects.length > 0 && !hasNewIssues
  return (
    <Section className='mt-8'>
      <Section className='mb-4'>
        <Text.H3B display='block'>Issues</Text.H3B>
      </Section>

      <table cellPadding='0' cellSpacing='0' width='100%' className='mb-4'>
        <tbody>
          <tr>
            <td width='25%' className='pr-2'>
              <StatCard
                showSubtitleSpace
                title='Ongoing'
                value={issues.issuesCount.toLocaleString()}
              />
            </td>
            <td width='25%' className='px-1'>
              <StatCard
                showSubtitleSpace
                title='New'
                value={issues.newIssuesCount.toLocaleString()}
              />
            </td>
            <td width='25%' className='px-1'>
              <StatCard
                showSubtitleSpace
                title='Escalating'
                value={issues.escalatedIssuesCount.toLocaleString()}
              />
            </td>
            <td width='25%' className='pl-2'>
              <StatCard
                showSubtitleSpace
                title='Resolved'
                value={issues.resolvedIssuesCount.toLocaleString()}
                subtitle={
                  issues.regressedIssuesCount > 0
                    ? `${issues.regressedIssuesCount} regressed`
                    : undefined
                }
              />
            </td>
          </tr>
        </tbody>
      </table>

      {!issues.hasIssues ? (
        <BlankSlateCard
          type='secondary'
          title='Learn about Issues'
          link={{
            label: 'Learn more about issues',
            href: ISSUES_VIDEO_URL,
          }}
          description='Issues help you identify and track problems in your AI applications. Watch this quick video to learn how to use Issues to improve your AI reliability.'
        />
      ) : null}
      {hasProjects ? (
        <Section className='bg-white border border-border rounded-lg overflow-hidden mb-4'>
          <Row className='bg-secondary border-b border-border'>
            <Column className='px-4 py-2 w-1/2'>
              <Text.H5B>Top Projects</Text.H5B>
            </Column>
            <Column className='px-4 py-2 w-1/4 text-right'>
              <Text.H5B>Issues</Text.H5B>
            </Column>
            <Column className='px-4 py-2 w-1/4 text-right'>
              <Text.H5B>New</Text.H5B>
            </Column>
          </Row>
          {issues.topProjects.slice(0, 5).map((project, index, array) => (
            <Row
              key={project.projectId}
              className={
                index === array.length - 1 ? '' : 'border-b border-border'
              }
            >
              <Column className='px-4 py-3 w-1/2'>
                <Link
                  href={
                    EMAIL_ROUTES.projects
                      .details(project.projectId)
                      .commits.details().issues.root
                  }
                >
                  <Text.H5 display='block' color='primary'>
                    {project.projectName}
                  </Text.H5>
                </Link>
              </Column>
              <Column className='px-4 py-3 w-1/4 text-right'>
                <Text.H5 color='foregroundMuted'>
                  {project.issuesCount.toLocaleString()}
                </Text.H5>
              </Column>
              <Column className='px-4 py-3 w-1/4 text-right'>
                <Text.H5 color='foregroundMuted'>
                  {project.newIssuesCount}
                </Text.H5>
              </Column>
            </Row>
          ))}
        </Section>
      ) : null}

      {hasNewIssues ? (
        <Section className='bg-white border border-border rounded-lg overflow-hidden'>
          <Row className='bg-secondary border-b border-border'>
            <Column className='px-4 py-2'>
              <Text.H5B>New Issues This Week</Text.H5B>
            </Column>
          </Row>
          {issues.newIssuesList.map((issue, index) => (
            <Row
              key={issue.id}
              className={
                index === issues.newIssuesList.length - 1
                  ? ''
                  : 'border-b border-border'
              }
            >
              <Column className='px-4 py-3'>
                <Link
                  href={EMAIL_ROUTES.projects
                    .details(issue.projectId)
                    .commits.details(issue.commitUuid)
                    .issues.details(issue.id)}
                >
                  <Text.H5 display='block' color='primary'>
                    {issue.title}
                  </Text.H5>
                  <Text.H6>{issue.projectName}</Text.H6>
                </Link>
              </Column>
            </Row>
          ))}
        </Section>
      ) : null}
    </Section>
  )
}

function AnnotationsSection({ annotations }: { annotations: AnnotationStats }) {
  const blankSlateUrl = annotations.firstProjectId
    ? EMAIL_ROUTES.projects
        .details(annotations.firstProjectId)
        .commits.details().annotations.root
    : ISSUES_VIDEO_URL
  return (
    <Section className='mt-8'>
      <Section className='mb-4'>
        <Text.H3B display='block'>Annotations</Text.H3B>
      </Section>

      <table cellPadding='0' cellSpacing='0' width='100%' className='mb-4'>
        <tbody>
          <tr>
            <td width='33%' className='pr-2'>
              <StatCard
                showSubtitleSpace
                title='Total Annotations'
                value={annotations.annotationsCount.toLocaleString()}
              />
            </td>
            <td width='33%' className='px-1'>
              <StatCard
                showSubtitleSpace
                title='Passed'
                value={`${annotations.passedPercentage.toFixed(0)}%`}
                subtitle={`${annotations.passedCount} annotations`}
              />
            </td>
            <td width='33%' className='pl-2'>
              <StatCard
                showSubtitleSpace
                title='Failed'
                value={`${annotations.failedPercentage.toFixed(0)}%`}
                subtitle={`${annotations.failedCount} annotations`}
              />
            </td>
          </tr>
        </tbody>
      </table>

      {!annotations.hasAnnotations ? (
        <BlankSlateCard
          type='secondary'
          title='Get started with Annotations'
          link={{
            label: 'Learn more about Annotations',
            href: blankSlateUrl,
          }}
          description='Annotating traces helps improve accuracy by providing valuable feedback.
      Identifying errors helps us refine algorithms and deliver better
      results.'
        />
      ) : null}
      {annotations.topProjects.length > 0 && (
        <Section className='bg-white border border-border rounded-lg overflow-hidden'>
          <Row className='bg-secondary border-b border-border'>
            <Column className='px-4 py-2 w-1/2'>
              <Text.H5B>Top Projects</Text.H5B>
            </Column>
            <Column className='px-4 py-2 w-1/4 text-right'>
              <Text.H5B>Total</Text.H5B>
            </Column>
            <Column className='px-4 py-2 w-1/4 text-right'>
              <Text.H5B>Pass Rate</Text.H5B>
            </Column>
          </Row>
          {annotations.topProjects.slice(0, 5).map((project, index, array) => (
            <Row
              key={project.projectId}
              className={
                index === array.length - 1 ? '' : 'border-b border-border'
              }
            >
              <Column className='px-4 py-3 w-1/2'>
                <Link
                  href={
                    EMAIL_ROUTES.projects
                      .details(project.projectId)
                      .commits.details().annotations.root
                  }
                >
                  <Text.H5 display='block' color='primary'>
                    {project.projectName}
                  </Text.H5>
                </Link>
              </Column>
              <Column className='px-4 py-3 w-1/4 text-right'>
                <Text.H5 color='foregroundMuted'>
                  {formatCount(project.annotationsCount)}
                </Text.H5>
              </Column>
              <Column className='px-4 py-3 w-1/4 text-right'>
                <Text.H5 color='foregroundMuted'>
                  {`${project.passedPercentage.toFixed(0)}% passed`}
                </Text.H5>
              </Column>
            </Row>
          ))}
        </Section>
      )}
    </Section>
  )
}

export default function WeeklyEmailMail({
  currentWorkspace,
  logs,
  issues,
  annotations,
}: WeeklyEmailMailProps) {
  return (
    <ContainerLayout
      previewText={`Your weekly summary for ${currentWorkspace.name}`}
      footer={<NotificationsFooter currentWorkspace={currentWorkspace} />}
    >
      <Section className='mb-6'>
        <Text.H2B display='block'>Weekly Summary</Text.H2B>
        <Section className='mt-2'>
          <Text.H4 color='foregroundMuted' display='block'>
            {currentWorkspace.name}
          </Text.H4>
        </Section>
      </Section>

      <LogsSection logs={logs} />
      <IssuesSection issues={issues} />
      <AnnotationsSection annotations={annotations} />
    </ContainerLayout>
  )
}

// cd packages/emails && pnpm email:dev for checking the UI
// To swap between different profiles, comment/uncomment the desired profile below:

WeeklyEmailMail.PreviewProps = fullActivityProfile
// WeeklyEmailMail.PreviewProps = issuesWithoutNewProfile
// WeeklyEmailMail.PreviewProps = logsOnlyProfile
// WeeklyEmailMail.PreviewProps = someActivityProfile
// WeeklyEmailMail.PreviewProps = zeroActivityProfile
// WeeklyEmailMail.PreviewProps = highVolumeProfile
