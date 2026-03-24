# Temporal Development Skill

A comprehensive skill for developers to use when building [Temporal](https://temporal.io/) applications.

> [!WARNING]
> This Skill is currently in Public Preview, and will continue to evolve and improve.
> We would love to hear your feedback - positive or negative - over in the [Community Slack](https://t.mp/slack), in the [#topic-ai channel](https://temporalio.slack.com/archives/C0818FQPYKY)

## Installation

### As a Claude Code Plugin

This skill is housed within a [Claude Code plugin](https://github.com/temporalio/agent-skills), which provides a simple way to install and receive future updates to the skill.

1. Run `/plugin marketplace add temporalio/agent-skills` 
2. Run `/plugin` to open the plugin manager
3. Select **Marketplaces**
4. Choose `temporal-marketplace` from the list
5. Select **Enable auto-update** or **Disable auto-update**
6. run `/plugin install temporal-developer@temporalio-agent-skills` 
7. Restart Claude Code

### Via `npx skills` - supports all major coding agents

1. `npx skills add temporalio/skill-temporal-developer`
2. Follow prompts

### Via manually cloning the skill repo:

1. `mkdir -p ~/.claude/skills && git clone https://github.com/temporalio/skill-temporal-developer ~/.claude/skills/temporal-developer`

Appropriately adjust the installation directory based on your coding agent.

## Currently Supported Temporal SDK Langages

- [x] Python ✅
- [x] TypeScript ✅
- [x] Go ✅
- [ ] Java 🚧 ([PR](https://github.com/temporalio/skill-temporal-developer/pull/42))
- [ ] .NET 🚧 ([PR](https://github.com/temporalio/skill-temporal-developer/pull/39))
- [ ] Ruby 🚧 ([PR](https://github.com/temporalio/skill-temporal-developer/pull/41))
- [ ] PHP 🚧 ([PR](https://github.com/temporalio/skill-temporal-developer/pull/40))
