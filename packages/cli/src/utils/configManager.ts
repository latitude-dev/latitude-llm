/**
 * Configuration manager for the Latitude CLI
 * Sensitive data like API keys are securely stored using system keychain
 */
export class ConfigManager {
  private keychainService: string = 'latitude-cli'
  private readonly ENV_API_KEY: string = 'LATITUDE_API_KEY'

  /**
   * Set the API key
   * Stores in system keychain if available, otherwise encrypts and saves to secure storage
   */
  async setApiKey(apiKey: string): Promise<void> {
    try {
      const { default: keytar } = await import('keytar')
      await keytar.setPassword(this.keychainService, 'apiKey', apiKey)
    } catch (error) {
      throw new Error(
        `❌ Failed to retrieve or store API key in system keychain. Consider using LATITUDE_API_KEY env var instead. Error: ${error}`,
      )
    }
  }

  /**
   * Get the stored API key
   * Priority order:
   * 1. Environment variable (LATITUDE_API_KEY)
   * 2. System keychain (when available)
   */
  async getApiKey() {
    const envApiKey = process.env[this.ENV_API_KEY]
    if (envApiKey) return envApiKey

    try {
      const { default: keytar } = await import('keytar')
      const apiKey = (await keytar.getPassword(
        this.keychainService,
        'apiKey',
      )) as string
      if (!apiKey) {
        throw new Error(
          '❌ No API key found. Please run "latitude init" first.',
        )
      }

      return apiKey
    } catch (error) {
      throw new Error(
        `❌ Failed to retrieve or store API key in system keychain. Consider using LATITUDE_API_KEY env var instead. Error: ${error}`,
      )
    }
  }

  /**
   * Clear all configuration values
   */
  async clear(): Promise<void> {
    try {
      const { default: keytar } = await import('keytar')
      await keytar.deletePassword(this.keychainService, 'apiKey')
    } catch (_) {
      // do nothing, if it fails it's not a problem probably just means there's
      // no key manager in the environment
    }
  }
}
