import { Latitude } from '@latitude-data/sdk'
import * as fs from 'fs/promises'
import * as path from 'path'

/**
 * Manages project operations for the Latitude CLI
 */
export class ProjectManager {
  /**
   * Verify if the directory contains a valid npm project
   */
  async verifyNpmProject(projectPath: string): Promise<boolean> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json')
      await fs.access(packageJsonPath)
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Create a new Latitude project
   */
  async createProject(
    client: Latitude,
    projectName: string,
  ): Promise<{
    projectId: number
    versionUuid: string
  }> {
    try {
      const { project, version } = await client.projects.create(projectName)
      return { projectId: project.id, versionUuid: version.uuid }
    } catch (error: any) {
      throw new Error(
        `Failed to create project: ${error.message || String(error)}`,
      )
    }
  }

  /**
   * Fetch all prompts from a project
   * @param client The Latitude client
   * @param projectId The project ID
   * @param versionUuid The version UUID to fetch (defaults to 'live')
   */
  async fetchAllPrompts(
    client: Latitude,
    projectId: number,
    versionUuid = 'live',
  ) {
    try {
      return await client.prompts.getAll({
        projectId,
        versionUuid,
      })
    } catch (error: any) {
      throw new Error(
        `Failed to fetch prompts: ${error.message || String(error)}`,
      )
    }
  }

  /**
   * Get a version from a project
   * @param client The Latitude client
   * @param projectId The project ID
   * @param versionUuid The version UUID to fetch (defaults to 'live')
   */
  async getVersion(
    client: Latitude,
    projectId: number,
    versionUuid: string = 'live',
  ) {
    try {
      return await client.versions.get(projectId, versionUuid)
    } catch (error: any) {
      throw new Error(
        `Failed to get version: ${error.message || String(error)}`,
      )
    }
  }

  /**
   * Create a new version/commit
   * @param client The Latitude client
   * @param name The name for the new version/commit
   */
  async createVersion(client: Latitude, name: string, projectId: number) {
    try {
      return await client.versions.create(name, { projectId })
    } catch (error: any) {
      throw new Error(
        `Failed to create version: ${error.message || String(error)}`,
      )
    }
  }
}
