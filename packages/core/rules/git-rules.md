---
name: git-rules
description: Git workflow and commit conventions
---

# Git Rules

Git workflow and commit message conventions.

## Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `style` | Formatting, no code change |
| `refactor` | Code refactoring |
| `test` | Tests |
| `chore` | Maintenance |
| `perf` | Performance |
| `ci` | CI/CD |

### Examples

```
feat(auth): add login endpoint
fix(api): resolve timeout issue
docs(readme): update installation steps
refactor(utils): simplify date handling
test(auth): add login success test
```

## Branch Naming

```
<type>/<ticket-id>-<description>
```

Examples:
- `feature/PROJ-123-user-login`
- `bugfix/PROJ-456-fix-timeout`
- `hotfix/PROJ-789-security-patch`
- `refactor/PROJ-101-simplify-api`

## Workflow

1. **Create Branch**: `git checkout -b feature/xxx`
2. **Make Changes**: Write code, add tests
3. **Commit**: Use conventional commits
4. **Push**: `git push -u origin feature/xxx`
5. **PR**: Create pull request
6. **Review**: Address feedback
7. **Merge**: Squash and merge

## Best Practices

- Commit often with atomic changes
- Write meaningful commit messages
- Don't commit secrets
- Keep `.gitignore` up to date
- Rebase over merge when possible
- Use `git add -p` for selective staging

## Protected Branches

- `main` or `master` - Protected, require PR
- `develop` - Integration branch

## Pre-commit Checklist

- [ ] Tests pass
- [ ] Linting passes
- [ ] No debug code
- [ ] Commit message follows conventions
