---
name: /test
description: Run tests with coverage analysis and failure diagnostics
category: testing
triggers:
  - test
  - 测试
  - run tests
---

# Test Skill

Run tests with coverage analysis and intelligent failure diagnostics.

## Usage

```
/test [options]
```

## Options

- `/test` - Run all tests
- `/test file.js` - Run tests in specific file
- `/test --coverage` - Run with coverage
- `/test --watch` - Run in watch mode
- `/test --fail-fast` - Stop on first failure

## Features

1. **Auto Detect**: Detects test framework (Jest, Vitest, Mocha, etc.)
2. **Smart Run**: Only runs related tests for changed files
3. **Coverage**: Shows coverage report
4. **Diagnostics**: Analyzes failures and suggests fixes
5. **Watch Mode**: Monitors for changes

## Example Output

```
✓ Running tests...
✓ 45 tests passed, 2 skipped

Coverage:
  src/utils.js    90%
  src/components  85%
  Overall         88%

Duration: 12.3s
```

## On Failure

When tests fail:
1. Show failure message
2. Show stack trace
3. Analyze and suggest:
   - Missing imports
   - Assertion errors
   - Type mismatches
4. Offer to fix
