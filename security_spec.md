# Security Specification for K.F.C. Robot Club Chat

## 1. Data Invariants
- A message must have a senderId that matches the authenticated user.
- Only the specific admin email (`kfcrobotpw@gmail.com`) can have `isAdmin: true` in their user document.
- Messages are immutable after creation (cannot be edited, only deleted by admin or owner).
- Users can only read/write their own user document.

## 2. The "Dirty Dozen" Payloads

### Messages (/messages/{id})
1. **Unauthorized Write**: Create message without being signed in.
2. **Identity Spoofing**: Create message with `senderId` different from `request.auth.uid`.
3. **Empty Message**: Create message with empty `text` or `text` longer than 1000 chars.
4. **Malicious ID**: Create message with document ID containing non-alphanumeric characters.
5. **Timestamp Manipulation**: Create message with a client-provided timestamp instead of `request.time`.
6. **Shadow Field**: Create message with an extra `isPinned: true` field.

### Users (/users/{id})
7. **Privilege Escalation**: Non-admin user tries to set `isAdmin: true`.
8. **Unauthorized Profile Read**: User tries to read another user's private profile (if we split).
9. **Identity Spoofing (User)**: User tries to write to a `userId` that isn't their own.
10. **Admin Spoof**: User with a different email tries to set `isAdmin: true`.

### General
11. **Blanket List**: Attempting to list all users without filters.
12. **Denial of Wallet**: Attempting to create a document with a 1MB string in an ID field.

## 3. Test Runner (Draft)
A `firestore.rules.test.ts` will be implemented to verify these.
