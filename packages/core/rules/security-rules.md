---
name: security-rules
description: Security rules and vulnerability prevention
---

# Security Rules

Security rules to prevent common vulnerabilities.

## Hardcoded Secrets

### ❌ Never Do This

```javascript
// Hardcoded API keys
const API_KEY = 'sk-1234567890abcdef'

// Hardcoded passwords
const PASSWORD = 'admin123'

// Hardcoded database URLs
const DB_URL = 'postgresql://user:pass@localhost/db'
```

### ✅ Instead

```javascript
// Use environment variables
const API_KEY = process.env.API_KEY

// Or secrets management
const apiKey = await secretsManager.get('api-key')

// Validate at runtime
if (!API_KEY) {
  throw new Error('API_KEY is required')
}
```

## SQL Injection

### ❌ Never Do This

```javascript
// User input in SQL query
const query = `SELECT * FROM users WHERE id = ${userId}`
```

### ✅ Instead

```javascript
// Parameterized queries
const query = 'SELECT * FROM users WHERE id = $1'
const result = await db.query(query, [userId])

// ORM
const user = await db.users.findById(userId)
```

## XSS Prevention

### ❌ Never Do This

```javascript
// Direct HTML insertion
element.innerHTML = userInput

// Template strings with user input
const html = `<div>${userContent}</div>`
```

### ✅ Instead

```javascript
// Use textContent
element.textContent = userInput

// Sanitize if HTML needed
import DOMPurify from 'dompurify'
element.innerHTML = DOMPurify.sanitize(userInput)

// Framework escaping (React, Vue, etc.)
// Most frameworks auto-escape by default
```

## Command Injection

### ❌ Never Do This

```javascript
// User input in shell command
exec(`git commit -m "${message}"`)
```

### ✅ Instead

```javascript
// Use parameterized commands
execFile('git', ['commit', '-m', message])

// Or sanitize input
const sanitized = message.replace(/[^a-zA-Z0-9\s]/g, '')
exec(`git commit -m "${sanitized}"`)
```

## Validation

Always validate user input:

```typescript
import { z } from 'zod'

const UserSchema = z.object({
  email: z.string().email(),
  age: z.number().min(0).max(150),
  name: z.string().min(1).max(100),
})

// Validate
const user = UserSchema.parse(input)
```

## Authentication

- Use secure token generation
- Implement proper session management
- Use HTTPS everywhere
- Implement rate limiting
- Hash passwords (bcrypt, Argon2)
