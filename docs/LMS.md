# Course-to-classroom workflow (LMS)

Super Admin -> Instructor -> Student, all on real persistent data with server-side authorisation.

## Roles and who can do what

| | Super Admin | Instructor | Student |
|---|---|---|---|
| Create/edit/archive courses, thumbnails, batches, assign/reassign instructors | yes (`/api/admin/*`, server-validated) | no | no |
| Approve/reject payments | yes (transactional, capacity-safe) | no | no |
| Upload/replace/publish/archive/delete resources, roadmap, notes, classes, attendance, recordings | yes | only in batches assigned to them | no |
| Read published resources, notes, classes, assignments | yes | assigned batches | only batches with an approved enrolment |

Instructor assignment = `batches/{id}.instructorId`. It is written only by `POST /api/admin/batches`, which checks the user exists, is enabled and holds the INSTRUCTOR claim. Firestore rules deny all browser writes to courses, batches, resources, notes, sessions, enrolments, submissions and certificates.

## Data model (reused, not duplicated)

`courses`, `batches` (+ instructor assignment), `enrollments` (+ payment fields), `batches/{b}/resources` (metadata: kind, title, fileName, mimeType, size, storagePath, uploadedBy, published, archived, order, version, allowDownload), `batches/{b}/notes` (title, date, session link, content, attachments, links, status, publishedAt, revision, history), `batches/{b}/liveSessions` (+ `sessionSecrets` for the Meet and recording URLs, `attendance`), `lessons`, `assignments`, `submissions`, `lessonProgress`, `certificates`.

## Files

- Stored in **private** storage via `server/storage.ts`. Never public; never inside Firestore.
- Upload (`POST /api/staff/batches/:b/resources`): size <= 25 MB, type allow-list (PDF, Office, ZIP, text, PNG/JPEG), extension must match, **magic bytes** must match, safe file name, roadmap must be a PDF. Progress bar in the UI uses XHR progress.
- Download: the browser asks `POST /api/batches/:b/resources/:id/link` (instructor of the batch / admin / student with approved enrolment and a **published** resource) and receives a 5-minute HMAC-signed link. The file endpoint re-checks the student's enrolment at use time, so removing an enrolment kills already-issued links. Responses are `no-store`; only PDFs/images open inline; per-file "allow download" switch.
- Guessing storage paths or URLs returns nothing (verified).

## Class timing

Times are stored in UTC and shown in Nepal time. The Meet link lives in `sessionSecrets` (staff-readable only) and is released by `POST /api/sessions/access` only when the **server** clock is inside the joining window (per-class override capped by the academy maximum). The UI countdown uses a server-corrected clock, but the decision is always server-side. Draft (unpublished) classes are invisible to students. Opening Meet does not record attendance; instructors mark attendance separately. A student could still forward the Meet link: use Google Meet host controls.

## Local development

```
npm run dev:all
npm run test:lms     # 18-step workflow against the real Firebase dev project (needs RATE_LIMIT_* raised on the API)
```

Files go to `.data/private-files` (git-ignored).

## Needs configuration before production

- **Object storage**: this project's Cloud Storage bucket does not exist (needs Cloud Storage / Blaze plan). Until then the server stores files on its own disk. Set up the bucket and run with `STORAGE_BACKEND=gcs` (implemented, **untested**), or mount persistent disk and back it up.
- Set `DOWNLOAD_TOKEN_SECRET` (random, stable) so file links survive restarts and multiple instances.
- Deploy `firestore.rules` (done for the dev project).
- Add `www.birtaacademy.com` to Firebase authorised domains; MFA for admins.
