---
name: /pr
description: Create GitHub pull request with description and linked issues
category: git
triggers:
  - pr
  - pull request
  - merge request
---

# Pull Request Skill

Create a GitHub pull request with intelligent description and linked issues.

## Usage

```
/pr [title]
```

If no title is provided, you will be prompted to enter one.

## Features

1. **Auto Description**: Generates PR description from commit history
2. **Issue Linking**: Automatically links related issues (fixes #123, closes #456)
3. **Reviewers**: Suggests reviewers based on file changes
4. **Checks**: Runs linting and tests before creating PR

## Workflow

1. Ensure branch is up to date
2. Check for merge conflicts
3. Generate PR description from commits
4. Suggest reviewers
5. Create PR on GitHub
6. Return PR URL

## Example Output

```
✓ Branch up to date with main
✓ No merge conflicts
✓ Generated description from 5 commits
✓ Suggested reviewers: @alice, @bob

PR created: https://github.com/owner/repo/pull/42
```

## Requirements

- GitHub CLI (`gh`) installed and authenticated
- Branch has commits
- Repository is a GitHub repo
