# Apex Medicina quarantine priority

The curation reads the open **public-bank** entries in Apex Medicina's
`public.question_quarantine` through the `question-quarantine` Edge Function
in the curation project (`jcbinmjiimqomjdyfdia`). This is distinct from
`question_lifecycle.state = 'under_review'` and the unaudited-question SQL scripts.

The bridge validates `x-apex-session` with `curation_session` before accessing
Apex. It reuses the existing server secrets `APEX_SERVICE_ROLE_KEY` and optional
`APEX_SUPABASE_URL` from `upload-question-image`. It returns only public question
IDs with `resolved_at IS NULL`; private professor questions and reviewer data
are never returned. The browser uses only the curation publishable key.

The table keeps those IDs first in both sort directions, within the active
filters. The default view includes all owners so quarantine is visible immediately. The Continue card and review navigation also prioritize quarantine
before ownership and P0–P3. A badge identifies quarantined rows. Entries remain
prioritized even if already audited in curation, until the quarantine is resolved
in Apex Medicina. This integration never opens, resolves, or edits quarantines.

The browser refreshes on login, every 30 seconds and on window focus. Failed
refreshes preserve the last successful list and display the connection error.
Resolved entries disappear from the priority group on the next successful read.

Deploy with:

```sh
supabase functions deploy question-quarantine --no-verify-jwt --project-ref jcbinmjiimqomjdyfdia
```

JWT verification is disabled because the function validates the existing curation
password session itself. A missing or invalid session must return 401; a valid
session returns `{ids: string[], checkedAt: string}`. No database migration is
required. All current quarantine IDs were verified to exist in the curation base.

Validation: `npm run lint`, `npm test`, `npm run build`. The bridge tests cover
session rejection, fixed public/open filters, pagination, and absent credentials;
priority and component tests cover ownership, descending order, and resolution.
