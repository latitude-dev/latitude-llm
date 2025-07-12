# How to Update the Changelog

This document explains how to update the changelog for the TypeScript SDK.

## When to Update

Update the changelog whenever you're about to release a new version of the SDK. The changelog should be updated **before** bumping the version in `package.json`.

## Format

The changelog follows the [Keep a
Changelog](https://keepachangelog.com/en/1.0.0/) format. Each version should
have a section with the following structure:

```markdown
## [VERSION] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes in existing functionality

### Deprecated
- Soon-to-be removed features

### Removed
- Removed features

### Fixed
- Bug fixes

### Security
- Security improvements
```

## Steps to Update

1. **Open `CHANGELOG.md`** in the `packages/sdks/typescript/` directory

2. **Add your new version section** below the `[Unreleased]` section:
   ```markdown
   ## [1.2.3] - 2025-01-16
   
   ### Added
   - New streaming API support
   - Better error handling
   
   ### Fixed
   - Fixed timeout issues in chat completion
   ```

3. **Update the version in `package.json`** to match your changelog version

4. **Commit and push** your changes

## What Happens Next

When you push to the main branch:
1. The GitHub Action will detect the new version
2. It will extract the changelog section for your version
3. It will create a GitHub release with that changelog content
4. The release will be tagged as `typescript-sdk-VERSION`

## Example

If your `package.json` has version `1.2.3`, the workflow will look for:
```markdown
## [1.2.3] - 2025-01-16

### Added
- New streaming API support
```

And use this content in the GitHub release.

