---
name: /lint
description: Run linter with auto-fix capabilities
category: linting
triggers:
  - lint
  - format
  - 检查
  - 格式化
---

# Lint Skill

Run linter with auto-fix capabilities and style enforcement.

## Usage

```
/lint [options]
```

## Options

- `/lint` - Check for issues
- `/lint --fix` - Auto-fix issues
- `/lint --strict` - Strict mode
- `/lint file.js` - Lint specific file

## Features

1. **Auto Detect**: Detects linter (ESLint, Prettier, Ruff, etc.)
2. **Auto Fix**: Automatically fixes fixable issues
3. **Format**: Applies Prettier formatting
4. **Strict Mode**: Catches more issues
5. **Config Aware**: Respects project configuration

## Supported Tools

| Language | Linter | Formatter |
|----------|--------|-----------|
| JavaScript/TypeScript | ESLint | Prettier |
| Python | Ruff, flake8 | Black, Ruff |
| Rust | clippy | rustfmt |
| Go | golangci-lint | gofmt |

## Example Output

```
✓ Running ESLint...
✓ 3 errors, 5 warnings

Errors:
  src/app.js:42  no-unused-vars  'unusedVar' is defined but never used
  src/utils.js:15  prefer-const   'counter' should be declared with 'const'

Run with --fix to auto-fix
```

## Auto-fix Output

```
✓ Fixed 5 issues automatically
✓ Formatted 12 files
```
