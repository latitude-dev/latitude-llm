#!/usr/bin/env tsx

import { faker } from '@faker-js/faker'
import { createProject } from '../../src/tests/factories/projects'
import { createDraft } from '../../src/tests/factories/commits'
import {
  createIssue,
  IssueHistogramData,
} from '../../src/tests/factories/issues'
import { mergeCommit } from '../../src/services/commits'
import { createNewDocument, updateDocument } from '../../src/services/documents'
import { database } from '../../src/client'
import { and, eq } from 'drizzle-orm'
import { issues } from '../../src/schema/models/issues'

import { projects } from '../../src/schema/models/projects'
import { workspaces } from '../../src/schema/models/workspaces'
import { commits } from '../../src/schema/models/commits'
import { documentVersions } from '../../src/schema/models/documentVersions'
import { memberships } from '../../src/schema/models/memberships'
import { users } from '../../src/schema/models/users'
import { CommitsRepository } from '../../src/repositories/commitsRepository'
import type { Project } from '../../src/schema/models/types/Project'
import type { Workspace } from '../../src/schema/models/types/Workspace'
import type { User } from '../../src/schema/models/types/User'
import type { Commit } from '../../src/schema/models/types/Commit'
import type { DocumentVersion } from '../../src/schema/models/types/DocumentVersion'

const EXISTING_WORKSPACE_ID = 109
const PROJECT_NAME = 'AI Agent Project'

type ProjectData = {
  project: Project
  user: User
  workspace: Workspace
  documents: DocumentVersion[]
  commit: Commit
}

async function createDocumentsAndCommits({
  workspace,
  project,
  user,
  documents,
}: ProjectData) {
  const drafts = []

  for (let i = 1; i <= 4; i++) {
    console.log(`\n📝 Creating draft ${i}...`)

    const { commit: draft } = await createDraft({ project, user })

    // Make some changes to different files in each draft
    const changes = [
      {
        path: 'main.promptl',
        content: `# AI Agent System - Updated v${i}

This is the main prompt file for our AI agent system. The system consists of multiple specialized agents that work together to solve complex problems.

## System Overview

Our AI agent system is designed to handle various tasks through specialized agents:

- **Agent One**: Handles data analysis and processing
- **Agent Two**: Manages communication and user interactions
- **Agent Three**: Performs research and information gathering

## Instructions

When a user provides a request, analyze it and determine which agent(s) should handle the task. Coordinate between agents as needed to provide a comprehensive response.

Always maintain context between agents and ensure smooth handoffs when multiple agents need to collaborate on a task.

## Recent Updates (Draft ${i})
- Enhanced coordination protocols
- Improved error handling mechanisms
- Updated agent communication standards`,
      },
      {
        path: `sub-agents/agent-${i === 1 ? 'one' : i === 2 ? 'two' : 'three'}.promptl`,
        content: `# Agent ${i === 1 ? 'One' : i === 2 ? 'Two' : 'Three'} - ${i === 1 ? 'Data Analysis' : i === 2 ? 'Communication' : 'Research'} Specialist

You are Agent ${i === 1 ? 'One' : i === 2 ? 'Two' : 'Three'}, specialized in ${i === 1 ? 'data analysis and processing' : i === 2 ? 'communication and user interaction management' : 'research and information gathering'}.

## Capabilities
${
  i === 1
    ? `- Statistical analysis
- Data visualization recommendations
- Pattern recognition in datasets
- Data cleaning and preprocessing
- Trend analysis and forecasting`
    : i === 2
      ? `- User interface design
- Communication strategy
- User experience optimization
- Feedback collection and analysis
- Stakeholder management`
      : `- Market research and analysis
- Competitive intelligence
- Technical documentation review
- Academic research synthesis
- Industry trend analysis`
}

## Instructions
When ${i === 1 ? 'given data analysis tasks' : i === 2 ? 'handling communication tasks' : 'conducting research'}:
${
  i === 1
    ? `1. Examine the data structure and quality
2. Identify key patterns and insights
3. Provide clear, actionable recommendations
4. Suggest appropriate visualizations
5. Highlight any data quality issues`
    : i === 2
      ? `1. Understand user needs and expectations
2. Design clear, intuitive interfaces
3. Ensure consistent messaging across channels
4. Gather and incorporate user feedback
5. Maintain professional relationships`
      : `1. Identify reliable information sources
2. Synthesize findings from multiple sources
3. Provide objective analysis and insights
4. Cite sources appropriately
5. Highlight key implications and recommendations`
}

${i === 1 ? 'Always present findings in a clear, professional manner with supporting evidence.' : i === 2 ? 'Focus on clarity, empathy, and user satisfaction in all interactions.' : 'Maintain high standards for accuracy and objectivity in all research activities.'}

## Draft ${i} Updates
- Enhanced ${i === 1 ? 'analytical' : i === 2 ? 'communication' : 'research'} capabilities
- Improved ${i === 1 ? 'data processing' : i === 2 ? 'user experience' : 'information synthesis'} workflows
- Updated ${i === 1 ? 'statistical' : i === 2 ? 'interaction' : 'documentation'} standards`,
      },
    ]

    // Apply changes to the draft
    for (const change of changes) {
      // Check if document already exists in the project
      const existingDoc = documents.find((doc) => doc.path === change.path)

      if (existingDoc) {
        // Update existing document
        await updateDocument({
          commit: draft,
          document: existingDoc,
          content: change.content,
        })
      } else {
        // Create new document
        const newDoc = await createNewDocument({
          workspace,
          user,
          commit: draft,
          path: change.path,
        }).then((r) => r.unwrap())

        await updateDocument({
          commit: draft,
          document: newDoc,
          content: change.content,
        })
      }
    }

    // @ts-expect-error - I dont care
    drafts.push(draft)
    console.log(`✅ Draft ${i} created with changes`)
  }

  // Publish the final version by merging the last draft
  console.log('\n🚀 Publishing final version...')
  const finalCommit = await mergeCommit(drafts[3])

  if (finalCommit.error) {
    console.error('❌ Failed to merge final version:', finalCommit.error)
    process.exit(1)
  }

  console.log('✅ Final version published successfully!')
  console.log(`📊 Version: ${finalCommit.unwrap().version}`)
  console.log(`🕒 Merged at: ${finalCommit.unwrap().mergedAt}`)

  // Display project summary
  console.log('\n📋 Project Summary:')
  console.log(`- Project: ${project.name}`)
  console.log(`- Workspace: ${workspace.name}`)
  console.log(`- User: ${user.email}`)
  console.log(`- Final Version: ${finalCommit.unwrap().version}`)
  console.log(
    `- Documents: main.promptl, sub-agents/agent-one.promptl, sub-agents/agent-two.promptl, sub-agents/agent-three.promptl`,
  )
  console.log(`- Drafts Created: ${drafts.length}`)
}

async function createBaseModelsWhenWorkspaceMissing() {
  const projectData = await createProject({
    name: 'AI Agent Project',
    documents: {
      'main.promptl': `# AI Agent System

This is the main prompt file for our AI agent system. The system consists of multiple specialized agents that work together to solve complex problems.

## System Overview

Our AI agent system is designed to handle various tasks through specialized agents:

- **Agent One**: Handles data analysis and processing
- **Agent Two**: Manages communication and user interactions
- **Agent Three**: Performs research and information gathering

## Instructions

When a user provides a request, analyze it and determine which agent(s) should handle the task. Coordinate between agents as needed to provide a comprehensive response.

Always maintain context between agents and ensure smooth handoffs when multiple agents need to collaborate on a task.`,
      'sub-agents/agent-one.promptl': `# Agent One - Data Analysis Specialist

You are Agent One, specialized in data analysis and processing tasks.

## Capabilities
- Statistical analysis
- Data visualization recommendations
- Pattern recognition in datasets
- Data cleaning and preprocessing
- Trend analysis and forecasting

## Instructions
When given data analysis tasks:
1. Examine the data structure and quality
2. Identify key patterns and insights
3. Provide clear, actionable recommendations
4. Suggest appropriate visualizations
5. Highlight any data quality issues

Always present findings in a clear, professional manner with supporting evidence.`,
      'sub-agents/agent-two.promptl': `# Agent Two - Communication Specialist

You are Agent Two, responsible for user communication and interaction management.

## Capabilities
- User interface design
- Communication strategy
- User experience optimization
- Feedback collection and analysis
- Stakeholder management

## Instructions
When handling communication tasks:
1. Understand user needs and expectations
2. Design clear, intuitive interfaces
3. Ensure consistent messaging across channels
4. Gather and incorporate user feedback
5. Maintain professional relationships

Focus on clarity, empathy, and user satisfaction in all interactions.`,
      'sub-agents/agent-three.promptl': `# Agent Three - Research Specialist

You are Agent Three, specialized in research and information gathering.

## Capabilities
- Market research and analysis
- Competitive intelligence
- Technical documentation review
- Academic research synthesis
- Industry trend analysis

## Instructions
When conducting research:
1. Identify reliable information sources
2. Synthesize findings from multiple sources
3. Provide objective analysis and insights
4. Cite sources appropriately
5. Highlight key implications and recommendations

Maintain high standards for accuracy and objectivity in all research activities.`,
    },
  })

  console.log('✅ Project created with initial structure')
  console.log(`📁 Project ID: ${projectData.project.id}`)
  console.log(`👤 User: ${projectData.user.email}`)
  console.log(`🏢 Workspace: ${projectData.workspace.name}`)
  await createDocumentsAndCommits(projectData)
  return projectData
}

async function findProjectData({
  workspaceId,
}: {
  workspaceId: number
}): Promise<ProjectData> {
  console.log(
    `🔍 Finding project "${PROJECT_NAME}" in workspace ${workspaceId}...`,
  )

  // Find the workspace
  const workspace = await database
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)

  if (workspace.length === 0) {
    throw new Error(`❌ Workspace with ID ${workspaceId} not found`)
  }

  // Find the project
  const project = await database
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.name, PROJECT_NAME),
      ),
    )
    .limit(1)

  if (project.length === 0) {
    throw new Error(
      `❌ Project "${PROJECT_NAME}" not found in workspace ${workspaceId}`,
    )
  }

  console.log(`✅ Found project "${PROJECT_NAME}" (ID: ${project[0].id})`)

  // Get all commits for this project
  const allCommits = await database
    .select()
    .from(commits)
    .where(eq(commits.projectId, project[0].id))
    .orderBy(commits.version)

  if (allCommits.length === 0) {
    throw new Error(`❌ No commits found for project "${PROJECT_NAME}"`)
  }

  console.log(`📝 Found ${allCommits.length} commits`)

  // Get all documents from ALL commits (not just head) to have issues across different versions
  const documentsFromAllCommits: DocumentVersion[] = []
  for (const commit of allCommits) {
    const docs = await database
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.commitId, commit.id))
    documentsFromAllCommits.push(...docs)
  }

  if (documentsFromAllCommits.length === 0) {
    throw new Error(`❌ No documents found across all commits`)
  }

  console.log(
    `📄 Found ${documentsFromAllCommits.length} documents across ${allCommits.length} commits`,
  )

  // Get the first user from workspace memberships
  const membership = await database
    .select({
      user: users,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.workspaceId, workspaceId))
    .limit(1)

  if (membership.length === 0) {
    throw new Error(`❌ No users found in workspace ${workspaceId}`)
  }

  const user = membership[0].user
  console.log(`👤 Using user: ${user.email}`)

  // Use the head commit for the main commit reference
  const headCommit = allCommits[allCommits.length - 1]

  return {
    project: project[0],
    user,
    workspace: workspace[0],
    documents: documentsFromAllCommits,
    commit: headCommit,
  }
}

async function deleteExistingIssuesAndHistograms(projectData: ProjectData) {
  console.log('🗑️  Deleting existing issues and histograms for project...')

  // Delete issues (this will cascade delete histograms due to foreign key constraint)
  await database
    .delete(issues)
    .where(eq(issues.projectId, projectData.project.id))

  console.log(
    `✅ Deleted existing issues and their histograms for project "${projectData.project.name}"`,
  )
}

async function main({ workspaceId }: { workspaceId?: number }) {
  console.log('🚀 Starting project creation script...')
  const projectData = workspaceId
    ? await findProjectData({ workspaceId })
    : await createBaseModelsWhenWorkspaceMissing()

  // Delete existing issues and histograms to make script idempotent
  await deleteExistingIssuesAndHistograms(projectData)

  console.log('📊 Creating issues and histograms...')
  await createIssuesAndHistograms(projectData)

  console.log('\n🎉 Script completed successfully!')

  // Exit the process to close database connections
  process.exit(0)
}

/**
 * Creates 200 issues with varied histogram data spanning 4 months.
 * Issues use real documentUuid from project documents.
 * Histogram patterns include:
 * - Recent issues (high counts in last 7 days)
 * - Escalating issues (counts > 10 in last 2 days)
 * - Regressed issues (resolved but with histogram data after resolved date)
 * - Various activity patterns to test sorting and filtering
 */
async function createIssuesAndHistograms(
  projectData: ProjectData,
  existingTitles: Set<string> = new Set(),
) {
  const today = new Date()
  const fourMonthsAgo = new Date(
    today.getFullYear(),
    today.getMonth() - 4,
    today.getDate(),
  )

  // Generate 200+ issues to ensure more pages (25 items per page)
  const issueCount = 200

  // Get document UUIDs from the project's documents
  const documentUuids = projectData.documents.map((doc) => doc.documentUuid)

  console.log(
    `🔍 Found ${documentUuids.length} documents in project for issue creation`,
  )

  if (documentUuids.length === 0) {
    console.log(
      '❌ No documents found in project. Cannot create issues without documents.',
    )
    return
  }

  console.log(`📄 Found ${documentUuids.length} documents to create issues for`)

  // Realistic issue titles that would help test filtering
  const issueTitles = [
    'Undefined variable reference',
    'Missing return statement',
    'Type mismatch in function call',
    'Array index out of bounds',
    'Null pointer dereference',
    'Infinite loop detected',
    'Memory allocation failure',
    'Division by zero error',
    'File not found exception',
    'Permission denied error',
    'Network timeout occurred',
    'Database connection failed',
    'Invalid JSON format',
    'Missing required parameter',
    'Circular dependency detected',
    'Resource already in use',
    'Invalid date format',
    'Missing error handling',
    'Inconsistent data state',
    'Performance degradation',
    'Security vulnerability found',
    'Configuration validation failed',
    'API rate limit exceeded',
    'Authentication token expired',
    'Data validation error',
  ]

  const issueDescriptions = [
    'This error occurs when trying to access a variable that has not been declared or initialized.',
    'The function is missing a return statement in one of its code paths.',
    'The function expects a different data type than what is being passed.',
    'The code is trying to access an array element that does not exist.',
    'Attempting to access a null or undefined object reference.',
    'The loop condition never becomes false, causing infinite execution.',
    'The system cannot allocate the requested amount of memory.',
    'Mathematical operation results in division by zero.',
    'The specified file path does not exist or cannot be accessed.',
    'The current user does not have permission to perform this action.',
    'The network request timed out after the specified duration.',
    'Unable to establish connection to the database server.',
    'The provided string is not in valid JSON format.',
    'A required function parameter is missing or undefined.',
    'Two or more modules depend on each other creating a cycle.',
    'The requested resource is already being used by another process.',
    'The provided date string is not in the expected format.',
    'The code does not handle potential error conditions properly.',
    'The data in the system is in an inconsistent state.',
    'The operation is taking longer than expected to complete.',
    'A potential security issue has been identified.',
    'The configuration file contains invalid or missing values.',
    'The API request limit has been exceeded for this time period.',
    'The authentication token is no longer valid and needs renewal.',
    'The input data does not meet the required validation criteria.',
  ]

  // Status distribution: 35% new, 20% escalating, 25% resolved, 15% ignored, 5% regressed
  const statusDistribution = [
    ...Array(35).fill('new'),
    ...Array(20).fill('escalating'),
    ...Array(25).fill('resolved'),
    ...Array(15).fill('ignored'),
    ...Array(15).fill('regressed'),
  ]

  // Date calculation for new issue type
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

  console.log(`📝 Creating ${issueCount} issues with histograms...`)

  let createdCount = 0
  let attempts = 0
  const maxAttempts = issueCount * 3 // Allow up to 3x attempts to find unique titles

  while (createdCount < issueCount && attempts < maxAttempts) {
    attempts++

    let title = faker.helpers.arrayElement(issueTitles)

    // If title already exists, try to make it unique by adding a suffix
    if (existingTitles.has(title)) {
      const suffix = faker.number.int({ min: 1, max: 999 })
      title = `${title} (${suffix})`
    }

    // Skip if still duplicate after modification
    if (existingTitles.has(title)) {
      continue
    }

    const description = faker.helpers.arrayElement(issueDescriptions)
    const status = faker.helpers.arrayElement(statusDistribution)

    // Generate dates based on the issue type to ensure proper categorization
    let issueCreatedAt: Date
    let histogramStartDate: Date
    let histogramEndDate: Date

    if (status === 'new') {
      // New issues: created within last 7 days (isNew = true)
      issueCreatedAt = faker.date.between({ from: sevenDaysAgo, to: today })
      const daysAfterCreation = faker.number.int({ min: 0, max: 7 })
      histogramStartDate = new Date(
        issueCreatedAt.getTime() + daysAfterCreation * 24 * 60 * 60 * 1000,
      )
      // Ensure histogramStartDate doesn't exceed today
      if (histogramStartDate > today) {
        histogramStartDate = new Date(today.getTime() - 24 * 60 * 60 * 1000) // Yesterday
      }
      histogramEndDate = today
    } else if (status === 'escalating') {
      // Escalating issues: older creation date, but high activity in last 2 days
      issueCreatedAt = faker.date.between({
        from: fourMonthsAgo,
        to: sevenDaysAgo,
      })
      const daysAfterCreation = faker.number.int({ min: 0, max: 30 })
      histogramStartDate = new Date(
        issueCreatedAt.getTime() + daysAfterCreation * 24 * 60 * 60 * 1000,
      )
      // Ensure histogramStartDate doesn't exceed today
      if (histogramStartDate > today) {
        histogramStartDate = issueCreatedAt
      }
      histogramEndDate = today
    } else if (status === 'regressed') {
      // Regressed issues: resolved but with histogram data after resolved date
      // Create histogram data that spans from past to today
      issueCreatedAt = faker.date.between({
        from: fourMonthsAgo,
        to: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000), // At least 30 days ago
      })
      const daysAfterCreation = faker.number.int({ min: 0, max: 30 })
      histogramStartDate = new Date(
        issueCreatedAt.getTime() + daysAfterCreation * 24 * 60 * 60 * 1000,
      )
      // Ensure histogramStartDate doesn't exceed today
      if (histogramStartDate > today) {
        histogramStartDate = issueCreatedAt
      }
      // Histogram extends to today (or near today) to ensure data after resolvedAt
      histogramEndDate = today
    } else {
      // Other issues (resolved/ignored): random dates within 4 months
      issueCreatedAt = faker.date.between({ from: fourMonthsAgo, to: today })
      const daysAfterCreation = faker.number.int({ min: 0, max: 30 })
      histogramStartDate = new Date(
        issueCreatedAt.getTime() + daysAfterCreation * 24 * 60 * 60 * 1000,
      )
      // Ensure histogramStartDate doesn't exceed today
      if (histogramStartDate > today) {
        histogramStartDate = issueCreatedAt
      }
      // Ensure valid date range for histogramEndDate
      const maxEndDate = new Date(
        Math.min(
          histogramStartDate.getTime() + 30 * 24 * 60 * 60 * 1000,
          today.getTime(),
        ),
      )
      histogramEndDate = faker.date.between({
        from: histogramStartDate,
        to: maxEndDate,
      })
    }

    // Get the commit history from the head commit (what the UI will use for the subquery)
    const commitsRepo = new CommitsRepository(
      projectData.workspace.id,
      database,
    )
    const commitHistory = await commitsRepo.getCommitsHistory({
      commit: projectData.commit,
    })

    // Generate histograms for ALL commits in history except one draft commit
    // This ensures issues appear in the UI for all commits, while testing filters with one commit without data
    const draftCommits = commitHistory.filter((c) => {
      const commitWithMergedAt = c as Commit
      return !commitWithMergedAt.mergedAt
    })

    // Randomly select one draft to exclude from histograms (for testing filters)
    const excludedDraft =
      draftCommits.length > 0 ? faker.helpers.arrayElement(draftCommits) : null

    const histogramCommits = commitHistory.filter((c) => c !== excludedDraft)

    if (excludedDraft) {
      const excludedCommitWithId = excludedDraft as { id: number }
      console.log(
        `   Excluding draft commit ${excludedCommitWithId.id} from histograms for testing`,
      )
    }

    // Get documents from the commits we're actually using for histograms
    const documentsFromHistogramCommits: DocumentVersion[] = []
    for (const commit of histogramCommits) {
      const commitWithId = commit as { id: number }
      const docs = await database
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.commitId, commitWithId.id))
      documentsFromHistogramCommits.push(...docs)
    }

    // Pick a document from the commits we're using for histograms
    let document: DocumentVersion
    if (documentsFromHistogramCommits.length > 0) {
      document = faker.helpers.arrayElement(documentsFromHistogramCommits)
    } else {
      // Fallback: get a document from any commit if none found in histogram commits
      const fallbackDocumentUuid = faker.helpers.arrayElement(documentUuids)
      const fallbackDocs = await database
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.documentUuid, fallbackDocumentUuid))
        .limit(1)
      document = fallbackDocs[0]!
    }

    // Generate histograms for each commit
    // Note: We need to aggregate counts across commits for the same date
    // The unique constraint is on (issue_id, commit_id, date), but since we're creating
    // one issue across multiple commits, we need to pick ONE commit per date
    const histogramsByDate = new Map<string, HistogramInput>()

    for (const commit of histogramCommits) {
      const commitWithId = commit as { id: number }
      const commitHistograms = generateHistogramData(
        histogramStartDate,
        histogramEndDate,
        commitWithId,
        status,
      )

      // For each histogram, keep track by date and aggregate counts
      for (const histogram of commitHistograms) {
        const dateKey = histogram.date.toISOString().split('T')[0] // YYYY-MM-DD
        const existing = histogramsByDate.get(dateKey)

        if (existing) {
          // Aggregate counts for the same date, keep the most recent commit
          existing.count += histogram.count
        } else {
          histogramsByDate.set(dateKey, { ...histogram })
        }
      }
    }

    const allHistograms = Array.from(histogramsByDate.values())

    // Ensure we have at least one histogram entry
    if (allHistograms.length === 0 && histogramCommits.length > 0) {
      // Create at least one histogram entry for the last commit on today's date
      const lastCommit = histogramCommits[histogramCommits.length - 1] as {
        id: number
      }
      allHistograms.push({
        commitId: lastCommit.id,
        date: today,
        count: 1,
      })
    }

    // Create issue with realistic data
    const issueData = await createIssue({
      workspace: projectData.workspace,
      project: projectData.project,
      document,
      title,
      description,
      createdAt: issueCreatedAt, // Set the issue creation date (firstSeenAt)
      histograms: allHistograms as IssueHistogramData[], // Type assertion needed as factory adds 'issue' field later
    })

    // Update escalating_at based on histogram data
    const { updateEscalatingIssue } = await import(
      '../../src/services/issues/updateEscalating.ts'
    )
    await updateEscalatingIssue({ issue: issueData.issue }).then((r) =>
      r.unwrap(),
    )

    // Add the new title to our set to avoid duplicates within this batch
    existingTitles.add(title)
    createdCount++

    // Set status based on distribution
    if (status === 'resolved') {
      await database
        .update(issues)
        .set({
          resolvedAt: faker.date.between({ from: histogramEndDate, to: today }),
        })
        .where(eq(issues.id, issueData.issue.id))
    } else if (status === 'regressed') {
      // For regressed: set resolvedAt in the middle of histogram range
      // This ensures histogram data exists both before and after resolvedAt
      // resolvedAt should be at least 7 days before histogramEndDate to ensure data after
      const minResolvedAt = new Date(
        histogramStartDate.getTime() + 3 * 24 * 60 * 60 * 1000,
      )
      const maxResolvedAt = new Date(
        histogramEndDate.getTime() - 7 * 24 * 60 * 60 * 1000,
      )
      // Ensure we have a valid range
      const resolvedAtFrom =
        minResolvedAt < maxResolvedAt ? minResolvedAt : histogramStartDate
      const resolvedAtTo =
        maxResolvedAt > histogramStartDate ? maxResolvedAt : histogramStartDate
      const resolvedAt = faker.date.between({
        from: resolvedAtFrom,
        to: resolvedAtTo > resolvedAtFrom ? resolvedAtTo : resolvedAtFrom,
      })
      await database
        .update(issues)
        .set({
          resolvedAt,
        })
        .where(eq(issues.id, issueData.issue.id))

      // Ensure we have histogram data after resolvedAt by extending histogram range if needed
      // The histogram already extends to today, so we just need to make sure we have data
      // after resolvedAt. The generateHistogramData function will create data throughout the range.
    } else if (status === 'ignored') {
      await database
        .update(issues)
        .set({
          ignoredAt: faker.date.between({ from: histogramEndDate, to: today }),
        })
        .where(eq(issues.id, issueData.issue.id))
    }

    if (createdCount % 20 === 0) {
      console.log(`   Created ${createdCount}/${issueCount} issues...`)
    }
  }

  console.log(
    `✅ Created ${createdCount} issues with histograms (${attempts} total attempts)`,
  )
}

type HistogramInput = {
  commitId: number
  date: Date
  count: number
}

/**
 * Generates realistic histogram data for issues with varied patterns:
 *
 * NEW ESCALATION DEFINITION:
 * - Events in the last 1 day (any count > 0)
 * - 7-day event count > 2× the previous 7-day average
 * - Total 7-day count ≥ 20 events (minimum threshold)
 *
 * Other patterns:
 * - Stable low counts (1-3): normal issues
 * - High recent activity (within 7 days): recent count issues
 * - Spikes: intermittent high activity
 * - Declining activity: resolved issues
 */
function generateHistogramData(
  firstSeenAt: Date,
  lastSeenAt: Date,
  commit: { id: number },
  issueType?: string,
): HistogramInput[] {
  const histograms: HistogramInput[] = []
  const startDate = new Date(firstSeenAt)
  const endDate = new Date(lastSeenAt)
  const today = new Date()
  const oneDayAgo = new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  const fourteenDaysAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000)

  // Track dates we've already added to prevent duplicates
  const addedDates = new Set<string>()

  const addHistogram = (date: Date, count: number) => {
    const dateKey = date.toISOString().split('T')[0] // YYYY-MM-DD
    if (!addedDates.has(dateKey)) {
      addedDates.add(dateKey)
      histograms.push({
        commitId: commit.id,
        date: new Date(date),
        count,
      })
    }
  }

  // Create different histogram patterns based on issue type
  if (issueType === 'escalating') {
    // ESCALATING PATTERN: Must satisfy all conditions
    // 1. Event in last 1 day: Add event for today
    // 2. 7-day total ≥ 20: Distribute ~30 events over last 7 days
    // 3. 7-day count > 2× previous average: Previous 7 days should have ~7 events (avg 1/day)

    // Previous 7-day window (days 8-14): Low baseline ~7 events total (1/day average)
    for (let i = 14; i >= 8; i--) {
      const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000)
      if (date >= startDate && date <= endDate) {
        addHistogram(date, faker.number.int({ min: 1, max: 2 }))
      }
    }

    // Current 7-day window: High activity ~35 events total
    // This gives: 35 > (7 / 7) * 2 = 35 > 2, which is TRUE ✓
    for (let i = 7; i >= 0; i--) {
      const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000)
      if (date >= startDate && date <= endDate) {
        if (i === 0) {
          // TODAY: Must have events (condition 1)
          addHistogram(date, faker.number.int({ min: 8, max: 12 }))
        } else {
          // Last 6 days: Distribute remaining ~25 events
          addHistogram(date, faker.number.int({ min: 3, max: 5 }))
        }
      }
    }

    // Add some older data before the 14-day window if range allows
    for (
      let date = new Date(startDate);
      date < fourteenDaysAgo;
      date.setDate(date.getDate() + 1)
    ) {
      if (Math.random() < 0.3) {
        // Sparse older data
        addHistogram(new Date(date), faker.number.int({ min: 1, max: 2 }))
      }
    }
  } else if (issueType === 'new') {
    // New issues: good recent activity since they're recently created
    for (
      let date = new Date(startDate);
      date <= endDate;
      date.setDate(date.getDate() + 1)
    ) {
      if (Math.random() < 0.7) {
        // Most days have events
        const isVeryRecent = date >= oneDayAgo
        const isRecent = date >= sevenDaysAgo

        addHistogram(
          new Date(date),
          isVeryRecent
            ? faker.number.int({ min: 5, max: 10 })
            : isRecent
              ? faker.number.int({ min: 3, max: 6 })
              : faker.number.int({ min: 1, max: 3 }),
        )
      }
    }
  } else {
    // Other issues: varied patterns
    for (
      let date = new Date(startDate);
      date <= endDate;
      date.setDate(date.getDate() + 1)
    ) {
      // Skip some days randomly to make it more realistic
      if (Math.random() < 0.3) continue

      const daysSinceFirstSeen = Math.floor(
        (date.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000),
      )
      const totalDays = Math.floor(
        (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000),
      )
      const isRecent = date >= sevenDaysAgo

      let count = 1
      const patternType = Math.random()

      if (patternType < 0.3) {
        // Pattern 1: Stable low count (1-3) throughout
        count = faker.number.int({ min: 1, max: 3 })
      } else if (patternType < 0.5) {
        // Pattern 2: Increasing counts over time
        const progress = daysSinceFirstSeen / Math.max(totalDays, 1)
        count = Math.floor(progress * 8) + faker.number.int({ min: 1, max: 3 })
      } else if (patternType < 0.7) {
        // Pattern 3: High activity in recent days
        count = isRecent
          ? faker.number.int({ min: 3, max: 8 })
          : faker.number.int({ min: 1, max: 3 })
      } else if (patternType < 0.85) {
        // Pattern 4: Sporadic activity with occasional spikes
        count =
          Math.random() < 0.2
            ? faker.number.int({ min: 8, max: 15 })
            : faker.number.int({ min: 1, max: 4 })
      } else {
        // Pattern 5: Declining activity (resolved issues)
        const progress = daysSinceFirstSeen / Math.max(totalDays, 1)
        count = Math.floor((1 - progress) * 6) + 1
        count = Math.max(count, 1)
      }

      // Add some random variation
      if (Math.random() < 0.15) {
        count += faker.number.int({ min: 1, max: 3 })
      }

      addHistogram(new Date(date), count)
    }
  }

  return histograms
}

main({ workspaceId: EXISTING_WORKSPACE_ID }).catch((error) => {
  console.error('❌ Script failed:', error)
  process.exit(1)
})
