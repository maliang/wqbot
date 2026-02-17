---
name: test-before-commit
description: Reminds to run tests before committing code changes
event: tool:before
enabled: true
priority: 50
action: warn
tools:
  - bash
patterns:
  - "git\\s+commit"
---

# Test Before Commit

This hook reminds you to run tests before committing changes.

## Behavior

When you run `git commit`, this hook will:
1. Check if tests exist in the project
2. Warn if tests haven't been run recently

## Configuration

You can customize this hook by editing the patterns or action:
- `action: warn` - Just show a warning (default)
- `action: block` - Block the commit until tests pass
