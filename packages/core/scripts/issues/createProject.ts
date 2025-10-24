#!/usr/bin/env tsx

import { faker } from '@faker-js/faker'
import { createProject } from '../../src/tests/factories/projects'
import { createDraft } from '../../src/tests/factories/commits'
import { createIssue } from '../../src/tests/factories/issues'
import { mergeCommit } from '../../src/services/commits'
import { createNewDocument, updateDocument } from '../../src/services/documents'
import { database } from '../../src/client'
import { eq } from 'drizzle-orm'
import { projects } from '../../src/schema/models/projects'
import { issues } from '../../src/schema/models/issues'

async function main() {
  console.log('🚀 Starting project creation script...')

  // Check if project already exists
  const existingProject = await database
    .select()
    .from(projects)
    .where(eq(projects.name, 'AI Agent Project'))
    .limit(1)

  let projectData
  if (existingProject.length > 0) {
    console.log('📁 Project already exists, skipping creation...')
    // Get the existing project and its related data
    projectData = await createProject({
      name: 'AI Agent Project',
      skipMerge: true, // Don't merge if project already exists
    })
  } else {
    // Create the project with initial structure
    projectData = await createProject({
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

Maintain high standards for accuracy and objectivity in all research activities.`
      }
    })
  }

  console.log('✅ Project created with initial structure')
  console.log(`📁 Project ID: ${projectData.project.id}`)
  console.log(`👤 User: ${projectData.user.email}`)
  console.log(`🏢 Workspace: ${projectData.workspace.name}`)

  // Check if issues already exist for this project
  const existingIssues = await database
    .select()
    .from(issues)
    .where(eq(issues.projectId, projectData.project.id))
    .limit(1)

  if (existingIssues.length > 0) {
    console.log('📊 Issues already exist, skipping creation...')
  } else {
    console.log('📊 Creating issues and histograms...')
    await createIssuesAndHistograms(projectData)
  }

  // Create 4 drafts with changes
  const drafts = []

  for (let i = 1; i <= 4; i++) {
    console.log(`\n📝 Creating draft ${i}...`)

    const { commit: draft } = await createDraft({
      project: projectData.project,
      user: projectData.user
    })

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
- Updated agent communication standards`
      },
      {
        path: `sub-agents/agent-${i === 1 ? 'one' : i === 2 ? 'two' : 'three'}.promptl`,
        content: `# Agent ${i === 1 ? 'One' : i === 2 ? 'Two' : 'Three'} - ${i === 1 ? 'Data Analysis' : i === 2 ? 'Communication' : 'Research'} Specialist

You are Agent ${i === 1 ? 'One' : i === 2 ? 'Two' : 'Three'}, specialized in ${i === 1 ? 'data analysis and processing' : i === 2 ? 'communication and user interaction management' : 'research and information gathering'}.

## Capabilities
${i === 1 ? `- Statistical analysis
- Data visualization recommendations
- Pattern recognition in datasets
- Data cleaning and preprocessing
- Trend analysis and forecasting` : i === 2 ? `- User interface design
- Communication strategy
- User experience optimization
- Feedback collection and analysis
- Stakeholder management` : `- Market research and analysis
- Competitive intelligence
- Technical documentation review
- Academic research synthesis
- Industry trend analysis`}

## Instructions
When ${i === 1 ? 'given data analysis tasks' : i === 2 ? 'handling communication tasks' : 'conducting research'}:
${i === 1 ? `1. Examine the data structure and quality
2. Identify key patterns and insights
3. Provide clear, actionable recommendations
4. Suggest appropriate visualizations
5. Highlight any data quality issues` : i === 2 ? `1. Understand user needs and expectations
2. Design clear, intuitive interfaces
3. Ensure consistent messaging across channels
4. Gather and incorporate user feedback
5. Maintain professional relationships` : `1. Identify reliable information sources
2. Synthesize findings from multiple sources
3. Provide objective analysis and insights
4. Cite sources appropriately
5. Highlight key implications and recommendations`}

${i === 1 ? 'Always present findings in a clear, professional manner with supporting evidence.' : i === 2 ? 'Focus on clarity, empathy, and user satisfaction in all interactions.' : 'Maintain high standards for accuracy and objectivity in all research activities.'}

## Draft ${i} Updates
- Enhanced ${i === 1 ? 'analytical' : i === 2 ? 'communication' : 'research'} capabilities
- Improved ${i === 1 ? 'data processing' : i === 2 ? 'user experience' : 'information synthesis'} workflows
- Updated ${i === 1 ? 'statistical' : i === 2 ? 'interaction' : 'documentation'} standards`
      }
    ]

    // Apply changes to the draft
    for (const change of changes) {
      // Check if document already exists in the project
      const existingDoc = projectData.documents.find(doc => doc.path === change.path)

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
          workspace: projectData.workspace,
          user: projectData.user,
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
  console.log(`- Project: ${projectData.project.name}`)
  console.log(`- Workspace: ${projectData.workspace.name}`)
  console.log(`- User: ${projectData.user.email}`)
  console.log(`- Final Version: ${finalCommit.unwrap().version}`)
  console.log(`- Documents: main.promptl, sub-agents/agent-one.promptl, sub-agents/agent-two.promptl, sub-agents/agent-three.promptl`)
  console.log(`- Drafts Created: ${drafts.length}`)

  console.log('\n🎉 Script completed successfully!')
}

async function createIssuesAndHistograms(projectData: any) {
  const today = new Date()
  const twoMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, today.getDate())

  // Generate 100+ issues to ensure 3-4 pages (25 items per page)
  const issueCount = 100

  // Get document UUIDs from the project's documents
  const documentUuids = projectData.documents.map((doc: any) => doc.documentUuid)

  if (documentUuids.length === 0) {
    console.log('❌ No documents found in project. Cannot create issues without documents.')
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
    'Data validation error'
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
    'The input data does not meet the required validation criteria.'
  ]

  // Status distribution: 40% new, 20% escalating, 25% resolved, 15% ignored
  const statusDistribution = [
    ...Array(40).fill('new'),
    ...Array(20).fill('escalating'),
    ...Array(25).fill('resolved'),
    ...Array(15).fill('ignored')
  ]

  console.log(`📝 Creating ${issueCount} issues with histograms...`)

  for (let i = 0; i < issueCount; i++) {
    const title = faker.helpers.arrayElement(issueTitles)
    const description = faker.helpers.arrayElement(issueDescriptions)
    const status = faker.helpers.arrayElement(statusDistribution)
    const documentUuid = faker.helpers.arrayElement(documentUuids)

    // Generate dates within the past 2 months
    const firstSeenAt = faker.date.between({ from: twoMonthsAgo, to: today })
    const lastSeenAt = faker.date.between({ from: firstSeenAt, to: today })

    // Create issue with realistic data
    const issueData = await createIssue({
      workspace: projectData.workspace,
      project: projectData.project,
      documentUuid,
      title,
      description,
      firstSeenAt,
      lastSeenAt,
      histograms: generateHistogramData(firstSeenAt, lastSeenAt, projectData.commit)
    })

    // Set status based on distribution
    if (status === 'resolved') {
      await database
        .update(issues)
        .set({ resolvedAt: faker.date.between({ from: lastSeenAt, to: today }) })
        .where(eq(issues.id, issueData.issue.id))
    } else if (status === 'ignored') {
      await database
        .update(issues)
        .set({ ignoredAt: faker.date.between({ from: lastSeenAt, to: today }) })
        .where(eq(issues.id, issueData.issue.id))
    }

    if (i % 20 === 0) {
      console.log(`   Created ${i + 1}/${issueCount} issues...`)
    }
  }

  console.log(`✅ Created ${issueCount} issues with histograms`)
}

function generateHistogramData(firstSeenAt: Date, lastSeenAt: Date, commit: any) {
  const histograms = []
  const startDate = new Date(firstSeenAt)
  const endDate = new Date(lastSeenAt)

  // Generate histogram data for each day between first seen and last seen
  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    // Skip some days randomly to make it more realistic
    if (Math.random() < 0.3) continue

    // Generate count with some variation (more activity on some days)
    const baseCount = faker.number.int({ min: 1, max: 5 })
    const multiplier = Math.random() < 0.1 ? faker.number.int({ min: 3, max: 8 }) : 1
    const count = baseCount * multiplier

    histograms.push({
      commitId: commit.id,
      date: new Date(date),
      count
    })
  }

  return histograms
}

main().catch((error) => {
  console.error('❌ Script failed:', error)
  process.exit(1)
})
