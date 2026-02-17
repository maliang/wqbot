---
title: User Registration
priority: high
status: pending
dependencies: []
acceptanceCriteria:
  - Users can register with email and password
  - Password is hashed before storage
  - Email verification is sent
  - Duplicate emails are rejected
---

# User Registration

Users should be able to create a new account with their email and password.

## Acceptance Criteria

- [ ] Users can register with email and password
- [ ] Password is hashed before storage
- [ ] Email verification is sent
- [ ] Duplicate emails are rejected

## Technical Notes

- Use bcrypt for password hashing
- Implement rate limiting on registration endpoint
- Store password hash, never plain text
