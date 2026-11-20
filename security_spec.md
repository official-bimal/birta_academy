# Birta Academy — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **PII Isolation**: User profiles (`/users/{userId}`), enrollments (`/enrollments/{enrollmentId}`), and admission inquiries (`/inquiries/{inquiryId}`) contain email/phone PII and are strictly readable only by the resource owner or an authenticated, email-verified Academy Admin (and assigned instructor on batch enrollments where applicable).
2. **No Self-Assigned Roles**: On `/users/{userId}` creation, non-admin callers MUST supply `role == 'student'` and `uid == request.auth.uid`. Non-admins can NEVER modify `role` on update.
3. **No Self-Approved Enrollments or Fake Payment Confirmation**: Students creating `/enrollments/{studentId_batchId}` MUST set `studentId == request.auth.uid`, `paymentStatus == 'pending_verification'`, `enrollmentStatus == 'pending'`, and reference existing `/courses/{courseId}` and `/batches/{batchId}` documents. Only verified Admins can transition `paymentStatus` to `'verified'` or `enrollmentStatus` to `'approved'` / `'completed'`.
4. **Master Gate for Course Materials**: Lessons, live session meeting links, assignments, and announcements live under `/batches/{batchId}/*` and are accessible ONLY to verified Admins, the assigned batch Instructor, or students whose `/enrollments/{uid}_{batchId}` document exists with `enrollmentStatus == 'approved'` (or `'completed'`).
5. **Immutable Audit Trail**: `/auditLogs/{logId}` is append-only by verified Admins (`allow update, delete: if false;`).
6. **Strict Schema, Sizes & Timestamps**: Every document validates allowed/required keys (`hasAll` + `hasOnly`), string `.size()` ceilings, valid ID regex (`^[a-zA-Z0-9_\-]+$`), and server timestamps (`request.time`).
7. **Terminal State Locking**: Once an enrollment reaches `'completed'` or `'rejected'`, or a certificate is `'revoked'`, non-admin modifications are permanently blocked.

## 2. The "Dirty Dozen" Adversarial Payloads

| # | Target Collection | Attack Vector | Malicious Payload / Condition | Expected Result |
|---|---|---|---|---|
| 1 | `/users/{uid}` | Self-Assigned Admin Role | `{ uid: "attacker", role: "admin", ... }` | `PERMISSION_DENIED` |
| 2 | `/users/{uid}` | Shadow Update Role Escalation | Update `{ role: "instructor", updatedAt: serverTimestamp() }` as student | `PERMISSION_DENIED` |
| 3 | `/users/{otherUid}` | PII Blanket Read | `getDoc(/users/victimUid)` as non-admin | `PERMISSION_DENIED` |
| 4 | `/enrollments/{uid}_{batchId}` | Self-Approved Payment | Create with `{ paymentStatus: "verified", enrollmentStatus: "approved" }` as student | `PERMISSION_DENIED` |
| 5 | `/enrollments/{uid}_{batchId}` | Identity Spoofing | Create with `{ studentId: "victimUid" }` as attacker | `PERMISSION_DENIED` |
| 6 | `/enrollments/{uid}_{batchId}` | Orphaned Batch Reference | Create referencing nonexistent `batchId: "fake-batch-999"` | `PERMISSION_DENIED` |
| 7 | `/batches/{batchId}/liveSessions/{id}` | Unenrolled Link Scraping | Read meeting URL when enrollment is still `pending` | `PERMISSION_DENIED` |
| 8 | `/courses/{courseId}` | Unauthorized Catalog Mutation | Create/update course as regular student | `PERMISSION_DENIED` |
| 9 | `/courses/{1500_char_id}` | ID Poisoning / Resource Exhaustion | Document ID exceeding 128 chars or containing invalid symbols | `PERMISSION_DENIED` |
| 10 | `/submissions/{subId}` | Student Self-Grading | Update `{ status: "graded", score: 100 }` as student | `PERMISSION_DENIED` |
| 11 | `/auditLogs/{logId}` | Audit Log Tampering | `updateDoc` or `deleteDoc` on `/auditLogs/{logId}` even as Admin | `PERMISSION_DENIED` |
| 12 | `/courses/{courseId}` | Email Spoofing (Unverified) | Admin email token with `email_verified: false` attempting write | `PERMISSION_DENIED` |
