#!/usr/bin/env tsx

import { faker } from '@faker-js/faker'
import { createProject } from '../../src/tests/factories/projects'
import { createDraft } from '../../src/tests/factories/commits'
import { createDocumentVersion } from '../../src/tests/factories/documents'
import { mergeCommit } from '../../src/services/commits'
import { createNewDocument, updateDocument } from '../../src/services/documents'
import { database } from '../../src/client'

async function main() {
  console.log('🚀 Starting project creation script...')

  // Create the project with initial structure
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

Maintain high standards for accuracy and objectivity in all research activities.`
    }
  })

  console.log('✅ Project created with initial structure')
  console.log(`📁 Project ID: ${projectData.project.id}`)
  console.log(`👤 User: ${projectData.user.email}`)
  console.log(`🏢 Workspace: ${projectData.workspace.name}`)

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

main().catch((error) => {
  console.error('❌ Script failed:', error)
  process.exit(1)
})