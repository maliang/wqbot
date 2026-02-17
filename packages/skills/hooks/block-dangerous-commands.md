---
name: block-dangerous-commands
description: Blocks dangerous shell commands
event: tool:before
enabled: true
priority: 100
action: block
tools:
  - bash
patterns:
  - "rm\\s+-rf\\s+/"
  - "mkfs\\."
  - "dd\\s+if="
  - ":\\(\\)\\s*\\{\\s*:\\s*\\|\\s*:\\s*&\\s*\\}\\s*;\\s*:"
  - "curl\\s+.*\\|\\s*(ba)?sh"
  - "wget\\s+.*\\|\\s*(ba)?sh"
---

# Block Dangerous Commands

This hook prevents execution of potentially destructive shell commands.

## Blocked Patterns

- `rm -rf /` - Recursive root deletion
- `mkfs.*` - Filesystem formatting
- `dd if=` - Direct disk operations
- Fork bombs
- Piping curl/wget to shell

## Usage

This hook is automatically enabled and will block any bash command matching these patterns.
