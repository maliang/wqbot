---
name: coding-standards
description: General coding standards and best practices
---

# Coding Standards

General coding standards that should be followed across all projects.

## Code Style

### Functions
- Keep functions small (< 50 lines)
- Single responsibility principle
- Use descriptive names
- Max 3 parameters; use objects for more

### Files
- Keep files under 800 lines
- One primary export per file
- Group related code together

### Naming
- `camelCase` for variables and functions
- `PascalCase` for classes and types
- `SCREAMING_SNAKE_CASE` for constants
- `kebab-case` for file names

### Comments
- Explain *why*, not *what*
- Use JSDoc for public APIs
- Keep comments updated

## TypeScript Specific

```typescript
// ✓ Good
interface User {
  id: string
  name: string
  email: string
}

// ✗ Avoid
interface UserData {
  // ambiguous names
  d: string
  n: string
  e: string
}
```

## Error Handling

- Always handle errors explicitly
- Use custom error types for different scenarios
- Log errors with context
- Never swallow errors silently

```typescript
// ✓ Good
try {
  await riskyOperation()
} catch (error) {
  logger.error('Operation failed', { error, context })
  throw new CustomError('Failed to complete', { cause: error })
}

// ✗ Avoid
try {
  await riskyOperation()
} catch {
  // silent failure
}
```

## Performance

- Avoid premature optimization
- Profile before optimizing
- Use appropriate data structures
- Cache expensive computations
