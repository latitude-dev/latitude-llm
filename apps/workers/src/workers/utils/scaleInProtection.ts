import { env } from '@latitude-data/env'
import { captureException } from './captureException'
import { BadRequestError } from '@latitude-data/core/lib/errors'

/**
 * Utility for managing ECS Fargate task scale-in protection
 * Protects tasks from being terminated while processing BullMQ jobs
 */

export class ScaleInProtectionManager {
  private protectionEnabled = false
  private taskProtectionEndpoint: string | null = null

  constructor() {
    if (env.ECS_AGENT_URI) {
      this.taskProtectionEndpoint = `${env.ECS_AGENT_URI}/task-protection/v1/state`
    }
  }

  /**
   * Enable scale-in protection for the current task
   */
  async enableProtection(): Promise<void> {
    if (!this.taskProtectionEndpoint) {
      console.warn('ECS_AGENT_URI not available, skipping scale-in protection')
      return
    }

    if (this.protectionEnabled) {
      return // Already protected
    }

    try {
      const response = await fetch(this.taskProtectionEndpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          protectionEnabled: true,
        }),
      })

      if (response.ok) {
        this.protectionEnabled = true
        console.log('Scale-in protection enabled for ECS task')
      } else {
        captureException(
          new BadRequestError(
            `Failed to enable scale-in protection: ${response.status} ${response.statusText}`,
          ),
        )
      }
    } catch (error) {
      console.error('Error enabling scale-in protection:', error)
    }
  }

  /**
   * Disable scale-in protection for the current task
   */
  async disableProtection(): Promise<void> {
    if (!this.taskProtectionEndpoint) {
      return
    }

    if (!this.protectionEnabled) {
      return // Already unprotected
    }

    try {
      const response = await fetch(this.taskProtectionEndpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          protectionEnabled: false,
        }),
      })

      if (response.ok) {
        this.protectionEnabled = false
        console.log('Scale-in protection disabled for ECS task')
      } else {
        console.error(
          `Failed to disable scale-in protection: ${response.status} ${response.statusText}`,
        )
      }
    } catch (error) {
      console.error('Error disabling scale-in protection:', error)
    }
  }

  /**
   * Check if scale-in protection is currently enabled
   */
  isProtectionEnabled(): boolean {
    return this.protectionEnabled
  }

  /**
   * Check if the ECS environment is available
   */
  isEcsEnvironment(): boolean {
    return this.taskProtectionEndpoint !== null
  }
}

// Global instance
export const scaleInProtectionManager = new ScaleInProtectionManager()
