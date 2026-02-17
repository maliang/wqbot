---
name: /commit
description: Git commit with intelligent staging and conventional commits
category: git
triggers:
  - commit
  - 提交
---

# Git Commit Skill

Create a git commit with intelligent staging and conventional commit messages.

## Usage

```
/commit [message]
```

If no message is provided, you will be prompted to enter one.

## Features

1. **Smart Staging**: Analyzes changed files and suggests what to stage
2. **Conventional Commits**: Supports conventional commit format:
   - `feat:` New feature
   - `fix:` Bug fix
   - `docs:` Documentation
   - `style:` Formatting
   - `refactor:` Code refactoring
   - `test:` Tests
   - `chore:` Maintenance
3. **Review**: Shows staged changes before committing

## Examples

```
/commit fix: resolve login issue with token refresh
/commit feat: add user authentication module
/commit refactor: simplify API response handling
```

## Workflow

1. Check git status
2. Analyze changed files
3. Suggest staging (or stage all)
4. Generate commit message
5. Allow editing
6. Execute commit
7. Show result
