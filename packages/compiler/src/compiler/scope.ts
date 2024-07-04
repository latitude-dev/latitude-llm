export default class Scope {
  /**
   * Global stash
   * All variable values are stored in a single global array. This is done to allow multiple
   * scopes to share the same variable values and be able to modify them.
   *
   * For example:
   * ```md
   * {var1 = 1}
   * {#if <condition>}
   *  {var1 = 2}
   *  {var2 = 3}
   * {/if}
   * ```
   * In this case, there are two scopes: root and if. Both scopes share the same variable `var1`,
   * and modifying it in the if scope should also modify it in the root scope. But `var2` is only
   * defined in the if scope and should not be accessible in the root scope.
   *
   * Local pointers
   * Every scope has its own local pointers that contains the indexes of the variables in the global stash.
   */
  private globalStash: unknown[] = [] // Stash of every variable value in the global scope
  private localPointers: Record<string, number> = {} // Index of every variable in the stash in the current scope

  constructor(globalScope: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(globalScope)) {
      this.localPointers[key] = this.addToStash(value)
    }
  }

  private readFromStash(index: number): unknown {
    return this.globalStash[index]
  }
  private addToStash(value: unknown): number {
    this.globalStash.push(value)
    return this.globalStash.length - 1
  }

  private modifyStash(index: number, value: unknown): void {
    this.globalStash[index] = value
  }

  exists(name: string): boolean {
    return name in this.localPointers
  }

  get(name: string): unknown {
    const index = this.localPointers[name] ?? undefined
    if (index === undefined)
      throw new Error(`Variable '${name}' does not exist`)
    return this.readFromStash(index)
  }

  set(name: string, value: unknown): void {
    if (!this.exists(name)) {
      this.localPointers[name] = this.addToStash(value)
      return
    }
    const index = this.localPointers[name]!
    this.modifyStash(index, value)
  }

  copy(): Scope {
    const scope = new Scope()
    scope.globalStash = this.globalStash
    scope.localPointers = { ...this.localPointers }
    return scope
  }
}

export type ScopeContext = {
  usedUndefinedVariables: Set<string> // Variables that are not in current scope but have been used
  definedVariables: Set<string> // Variables that are in current scope
}
