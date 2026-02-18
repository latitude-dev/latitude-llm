import { and, eq, isNull, ne } from 'drizzle-orm'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { database } from '../src/client'
import { users } from '../src/schema/models/users'
import { workspaces } from '../src/schema/models/workspaces'
import { projects } from '../src/schema/models/projects'
import { commits } from '../src/schema/models/commits'
import { providerApiKeys } from '../src/schema/models/providerApiKeys'
import { subscriptions } from '../src/schema/models/subscriptions'
import { createUser } from '../src/services/users/createUser'
import { createWorkspace } from '../src/services/workspaces/create'
import { createProject } from '../src/services/projects/create'
import { createMembership } from '../src/services/memberships/create'
import { createApiKey } from '../src/services/apiKeys/create'
import { createProviderApiKey } from '../src/services/providerApiKeys/create'
import { encryptProviderToken } from '../src/services/providerApiKeys/helpers/tokenEncryption'
import { createFeature } from '../src/services/features/create'
import { toggleFeatureGlobally } from '../src/services/features/toggleGlobally'
import { changeWorkspacePlan } from '../src/services/workspaces/changePlan'
import { FeaturesRepository } from '../src/repositories'
import { unsafelyFindWorkspace } from '../src/data-access/workspaces'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../src/repositories'
import { selectFirstApiKey } from '../src/queries/apiKeys/selectFirst'
import { HEAD_COMMIT, Providers } from '@latitude-data/constants'
import { createNewDocumentUnsafe } from '../src/services/documents/createUnsafe'
import { updateDocumentUnsafe } from '../src/services/documents/updateUnsafe'
import { type Commit } from '../src/schema/models/types/Commit'
import { type User } from '../src/schema/models/types/User'
import { type Workspace } from '../src/schema/models/types/Workspace'
import { type Feature } from '../src/schema/models/types/Feature'
import { SubscriptionPlan } from '../src/plans'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const REFERENCE_EMAIL = 'gerard@latitude.so'
const REFERENCE_WORKSPACE = 'Latitude Reference'
const REFERENCE_PROJECT = 'Copilot'
const PROMPTS_DIR = path.join(__dirname, 'prompts')
const ENTERPRISE_PROVIDER_NAME = 'OpenAI'
const GLOBAL_FEATURES = [
  'issues',
  'traces',
  'evaluationGenerator',
  'testing',
  'optimizations',
]

/**
 * Recursively gets all .promptl files from a directory
 */
function getAllPromptlFiles(
  dir: string,
  baseDir: string = dir,
): { path: string; fullPath: string }[] {
  const files: { path: string; fullPath: string }[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...getAllPromptlFiles(fullPath, baseDir))
    } else if (entry.isFile() && entry.name.endsWith('.promptl')) {
      // Convert absolute path to relative path from prompts directory
      const relativePath = path.relative(baseDir, fullPath)
      // Remove .promptl extension, convert to forward slashes, replace spaces with dashes
      const documentPath = relativePath
        .replace(/\\/g, '/')
        .replace(/\.promptl$/, '')
        .replace(/\s+/g, '-')
      files.push({ path: documentPath, fullPath })
    }
  }

  return files
}

async function migrateExistingUsersToAdmins() {
  console.log('\n--- Migrating existing users to admins ---')

  const nonAdminUsers = await database
    .select()
    .from(users)
    .where(eq(users.admin, false))

  if (nonAdminUsers.length === 0) {
    console.log('✓ All users are already admins')
    return
  }

  console.log(`Found ${nonAdminUsers.length} non-admin users to migrate`)

  await database
    .update(users)
    .set({ admin: true })
    .where(eq(users.admin, false))

  console.log(`✓ Migrated ${nonAdminUsers.length} users to admins`)
}

async function migrateExistingWorkspacesToEnterprise() {
  console.log('\n--- Migrating existing workspaces to enterprise plan ---')

  const workspacesWithNonEnterprise = await database
    .select({
      workspace: workspaces,
      subscription: subscriptions,
    })
    .from(workspaces)
    .innerJoin(
      subscriptions,
      eq(workspaces.currentSubscriptionId, subscriptions.id),
    )
    .where(ne(subscriptions.plan, SubscriptionPlan.EnterpriseV1))

  if (workspacesWithNonEnterprise.length === 0) {
    console.log('✓ All workspaces are already on enterprise plan')
    return
  }

  console.log(
    `Found ${workspacesWithNonEnterprise.length} workspaces to migrate to enterprise plan`,
  )

  for (const { workspace } of workspacesWithNonEnterprise) {
    const fullWorkspace = await unsafelyFindWorkspace(workspace.id)
    if (!fullWorkspace) {
      console.log(`  ✗ Failed to load workspace ${workspace.id}`)
      continue
    }

    const result = await changeWorkspacePlan(
      fullWorkspace,
      SubscriptionPlan.EnterpriseV1,
    )
    if (result.error) {
      console.log(
        `  ✗ Failed to migrate workspace ${workspace.name}: ${result.error.message}`,
      )
      continue
    }

    console.log(`  ✓ Migrated workspace: ${workspace.name}`)
  }

  console.log(`✓ Workspace migration complete`)
}

async function main() {
  if (process.env.LATITUDE_ENTERPRISE_MODE !== 'true') {
    console.log('Skipping setup in non-enterprise mode')
    return
  }

  console.log('Starting setup...')

  await migrateExistingUsersToAdmins()
  await migrateExistingWorkspacesToEnterprise()

  // 1. Find or create user
  console.log(`Checking for user: ${REFERENCE_EMAIL}`)
  let user: User | undefined = await database
    .select()
    .from(users)
    .where(eq(users.email, REFERENCE_EMAIL))
    .limit(1)
    .then((rows) => rows[0])

  if (!user) {
    console.log(`User not found. Creating user: ${REFERENCE_EMAIL}`)
    const result = await createUser({
      email: REFERENCE_EMAIL,
      name: 'Gerard',
      confirmedAt: new Date(),
      admin: true,
    })
    if (result.error) throw result.error
    user = result.value
    console.log(`✓ User created with ID: ${user.id}`)
  } else {
    console.log(`✓ User found with ID: ${user.id}`)
  }

  // 2. Find or create workspace
  console.log(`Checking for workspace: ${REFERENCE_WORKSPACE}`)
  const workspaceByName = await database
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, REFERENCE_WORKSPACE))
    .limit(1)
    .then((rows) => rows[0])

  let workspace: Workspace
  if (!workspaceByName) {
    console.log(
      `Workspace not found. Creating workspace: ${REFERENCE_WORKSPACE}`,
    )
    const result = await createWorkspace({
      name: REFERENCE_WORKSPACE,
      user,
    })
    if (result.error) throw result.error
    workspace = result.value
    console.log(`✓ Workspace created with ID: ${workspace.id}`)

    // Create membership for the user
    const membershipResult = await createMembership({
      user,
      workspace,
      confirmedAt: new Date(),
    })
    if (membershipResult.error) throw membershipResult.error
    console.log(`✓ Membership created`)
  } else {
    console.log(`✓ Workspace found with ID: ${workspaceByName.id}`)
    // Fetch the workspace with subscription data using the proper helper
    workspace = await unsafelyFindWorkspace(workspaceByName.id)
    if (!workspace) {
      throw new Error('Failed to load workspace with subscription data')
    }
  }

  const enterpriseToken =
    process.env.ENTERPRISE_OPENAI_API_KEY ?? 'fake-enterprise-openai-api-key'

  if (!process.env.ENTERPRISE_OPENAI_API_KEY) {
    console.warn(
      'ENTERPRISE_OPENAI_API_KEY is not set, using fake-enterprise-openai-api-key',
    )
  }

  const existingProvider = await database
    .select()
    .from(providerApiKeys)
    .where(
      and(
        eq(providerApiKeys.workspaceId, workspace.id),
        eq(providerApiKeys.name, ENTERPRISE_PROVIDER_NAME),
        eq(providerApiKeys.provider, Providers.OpenAI),
        isNull(providerApiKeys.deletedAt),
      ),
    )
    .limit(1)
    .then((rows) => rows[0])

  if (!existingProvider) {
    const providerResult = await createProviderApiKey({
      workspace,
      provider: Providers.OpenAI,
      name: ENTERPRISE_PROVIDER_NAME,
      token: enterpriseToken,
      author: user,
    })

    if (providerResult.error) throw providerResult.error
    console.log(`✓ Provider API key created: ${ENTERPRISE_PROVIDER_NAME}`)
  } else {
    await database
      .update(providerApiKeys)
      .set({
        token: encryptProviderToken(enterpriseToken),
        updatedAt: new Date(),
      })
      .where(eq(providerApiKeys.id, existingProvider.id))

    console.log(`✓ Provider API key updated: ${ENTERPRISE_PROVIDER_NAME}`)
  }

  const apiKeyResult = await selectFirstApiKey({ workspaceId: workspace.id })

  if (!apiKeyResult) {
    const apiKeyCreated = await createApiKey({ workspace }).then((r) =>
      r.unwrap(),
    )
    console.log(`✓ API key created with ID: ${apiKeyCreated.id}`)
  } else {
    console.log(`✓ API key found with ID: ${apiKeyResult.id}`)
  }

  // 3. Enable global features
  console.log(`\nEnabling global features: ${GLOBAL_FEATURES.join(', ')}`)
  const featuresRepo = new FeaturesRepository()

  for (const featureName of GLOBAL_FEATURES) {
    console.log(`  Enabling feature: ${featureName}`)
    const featureResult = await featuresRepo.findByName(featureName)

    let feature: Feature
    if (featureResult.ok) {
      feature = featureResult.value!
    } else {
      // Feature doesn't exist, create it
      const createResult = await createFeature({ name: featureName })
      if (createResult.error) {
        console.error(
          `  ✗ Failed to create feature ${featureName}:`,
          createResult.error,
        )
        continue
      }
      feature = createResult.value
      console.log(`    ✓ Feature ${featureName} created`)
    }

    // Enable the feature globally
    const toggleResult = await toggleFeatureGlobally(feature.id, true)
    if (toggleResult.error) {
      console.error(
        `  ✗ Failed to enable feature ${featureName}:`,
        toggleResult.error,
      )
      continue
    }
    console.log(`    ✓ Feature ${featureName} enabled globally`)
  }

  // 4. Find or create project
  console.log(`Checking for project: ${REFERENCE_PROJECT}`)
  const projectResults = await database
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspace.id),
        eq(projects.name, REFERENCE_PROJECT),
      ),
    )
    .limit(1)

  let project = projectResults[0]
  let commit: Commit

  if (!project) {
    console.log(`Project not found. Creating project: ${REFERENCE_PROJECT}`)
    const result = await createProject({
      workspace,
      user,
      name: REFERENCE_PROJECT,
    })
    if (result.error) throw result.error
    project = result.value.project
    commit = result.value.commit
    console.log(`✓ Project created with ID: ${project.id}`)

    // Manually merge the initial commit to create HEAD (set mergedAt and version)
    console.log(`Merging initial commit to create HEAD...`)
    const mergedCommits = await database
      .update(commits)
      .set({ mergedAt: new Date(), version: 1 })
      .where(eq(commits.id, commit.id))
      .returning()
    commit = mergedCommits[0]!
    console.log(`✓ Initial commit merged`)
  } else {
    console.log(`✓ Project found with ID: ${project.id}`)

    // Get the HEAD commit
    const commitsRepo = new CommitsRepository(workspace.id)
    const commitResult = await commitsRepo.getCommitByUuid({
      projectId: project.id,
      uuid: HEAD_COMMIT,
    })
    if (commitResult.error) throw commitResult.error
    commit = commitResult.value
  }

  // 5. Update prompts from the prompts folder
  console.log(`\nUpdating prompts from ${PROMPTS_DIR}`)
  const promptFiles = getAllPromptlFiles(PROMPTS_DIR)
  console.log(`Found ${promptFiles.length} prompt files`)

  // If commit doesn't have a mainDocumentUuid, set a placeholder to avoid updateCommit issues
  if (!commit.mainDocumentUuid) {
    const placeholderUuid = crypto.randomUUID()
    await database
      .update(commits)
      .set({ mainDocumentUuid: placeholderUuid })
      .where(eq(commits.id, commit.id))
    commit.mainDocumentUuid = placeholderUuid
    console.log(`  ✓ Set placeholder main document UUID`)
  }

  const docsRepo = new DocumentVersionsRepository(workspace.id)

  let created = 0
  let updated = 0
  let firstDocumentUuid: string | null = null

  for (const { path: documentPath, fullPath } of promptFiles) {
    const content = fs.readFileSync(fullPath, 'utf-8')

    try {
      // Try to get existing document
      const docResult = await docsRepo.getDocumentByPath({
        commit,
        path: documentPath,
      })

      if (docResult.ok) {
        // Document exists, update it using unsafe version (bypasses merge check)
        const document = docResult.unwrap()
        await updateDocumentUnsafe({
          commit,
          document,
          data: {
            content,
          },
        }).then((r) => r.unwrap())
        updated++
        console.log(`  ✓ Updated: ${documentPath}`)
      } else {
        // Document doesn't exist, create it using unsafe version
        const newDoc = await createNewDocumentUnsafe({
          workspace,
          commit,
          path: documentPath,
          content,
        }).then((r) => r.unwrap())

        // Store the first document UUID to set as main document
        if (!firstDocumentUuid) {
          firstDocumentUuid = newDoc.documentUuid
        }

        created++
        console.log(`  ✓ Created: ${documentPath}`)
      }
    } catch (error) {
      console.error(`  ✗ Failed to process: ${documentPath}`)
      console.error(`    File: ${fullPath}`)
      throw error
    }
  }

  // If we created documents and the commit doesn't have a main document, set it manually
  if (firstDocumentUuid && !commit.mainDocumentUuid) {
    await database
      .update(commits)
      .set({ mainDocumentUuid: firstDocumentUuid })
      .where(eq(commits.id, commit.id))
    console.log(`  ✓ Set main document UUID: ${firstDocumentUuid}`)
  }

  console.log(`\n✅ Setup complete!`)
  console.log(`Summary:`)
  console.log(`  - User: ${user.email}`)
  console.log(`  - Workspace: ${workspace.name} (ID: ${workspace.id})`)
  console.log(`  - Project: ${project.name} (ID: ${project.id})`)
  console.log(`  - Global features enabled: ${GLOBAL_FEATURES.length}`)
  console.log(`  - Prompts created: ${created}`)
  console.log(`  - Prompts updated: ${updated}`)
  console.log(`  - Total prompts: ${promptFiles.length}`)
}

main()
  .then(() => {
    console.log('\nExiting...')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Error during setup:', error)
    process.exit(1)
  })
