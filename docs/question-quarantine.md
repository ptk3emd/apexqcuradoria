# Apex Medicina synchronization and quarantine priority

The curation project (`jcbinmjiimqomjdyfdia`) maintains a server-side mirror of
public-question availability in Apex Medicina (`beedxpjaufgujusyuziq`). It reads:

- `public.questions`: catalog IDs and full content only for missing quarantine questions;
- `public.question_lifecycle`: lifecycle state (a missing lifecycle row means active);
- `public.question_quarantine`: open public quarantines and applied exclusion proposals.

Private professor questions, reviewer identities and proposed payloads are never
copied or exposed. Apex source tables are read-only throughout this integration.
The unaudited-question lifecycle scripts remain separate from professor/admin
quarantine records.

## Automatic synchronization

The `apex-question-sync` pg_cron job runs every minute, even without an open
browser. `curation_private.request_apex_sync()` enqueues a pg_net request to the
`sync-apex-questions` Edge Function. It sends a short-lived, single-use random
token; only the token hash is stored in the private runs table. The worker
validates/consumes that token through a service-role-only RPC before source reads.
No persistent service-role credential is embedded in cron commands or frontend
code. Replayed, expired, missing or forged tokens cannot run synchronization.

The worker reuses the server-only `APEX_SERVICE_ROLE_KEY` and optional
`APEX_SUPABASE_URL` already used by image uploads. Its own
`SUPABASE_SERVICE_ROLE_KEY` is supplied by Supabase. It checks every source page
with keyset pagination, including repeated public-question IDs in historical
quarantines (UUID cursor). Failed reads cannot publish an incomplete catalog.

For each open public quarantine missing from curation, the worker imports the
original question ID and supported content fields. Existing IDs are skipped,
never upserted: local corrections, assignments, statuses, comments and concurrent
edits remain intact. The existing source trigger creates the pending curation
entry and sync event so every connected curator receives the imported question.
The legacy ID-reassignment trigger and imports share an advisory lock, preventing
concurrent duplicate imports from renumbering questions.

Availability is committed atomically after all reads/imports succeed. Unchanged
states avoid updates; source IDs removed from Apex leave the mirror. The prior
complete availability snapshot survives failures; imported questions remain for
retry if a later step fails. Stuck attempts expire after five minutes. Run
history is kept for seven days; active/recent runs throttle manual requests and
prevent overlapping workers.

## Curation interface

The browser reads `curation_apex_status` through the existing password session,
every 15 seconds and on window focus. This reports availability separately from
the curation review status. Unknown states stay explicitly unknown until the
first complete source snapshot. A question is active when its lifecycle is
active, without an open quarantine or applied exclusion. Other states show their
reason: draft, under review, obsolete, archived, excluded, or missing in Apex.

The default table includes all owners. Filters show all, active, inactive,
quarantined or unsynchronized questions with counts. Source-state badges appear
in the table and detail view, including quarantine reason in the detail. Open
quarantines precede other priorities in either sorting direction, the Continue
card, and review navigation. User-selected text/owner/review filters still apply.

The synchronization panel displays the last complete read, progress and errors.
“Sincronizar agora” requests a rate-limited server refresh using
`curation_apex_refresh`; it never bypasses session checks. Failed browser polls
preserve the last received states. Resolving a quarantine removes its priority
on the next successful server cycle and browser refresh. Synchronization does
not itself approve questions or close quarantines.

The older `question-quarantine` Edge Function remains available for the initial
frontend version. The enhanced frontend uses the persisted server mirror.

## Deployment and verification

Apply both `apex_question_sync` and `apex_question_sync_schedule` migrations, then
deploy the worker:

```sh
supabase functions deploy sync-apex-questions --no-verify-jwt --project-ref jcbinmjiimqomjdyfdia
```

The custom single-use token authentication replaces platform JWT verification.
Deploy the worker before enabling the schedule on a fresh installation. The
migrations' filenames match the versions recorded in production migration history.
Neither migration belongs in the Apex Medicina project.

Verify the schedule and sanitized run results as a database administrator:

```sql
select jobname, schedule, active from cron.job where jobname = 'apex-question-sync';
select status, created_at, finished_at, imported, source_count, error
from curation_private.apex_sync_runs order by created_at desc limit 5;
```

Do not log request headers, run token hashes, server secrets or private source
data. Public clients cannot access private tables or invoke any worker RPC.

Validation: `npm run lint`, `npm test`, `npm run build`. Tests cover worker
pagination, source failures, missing imports, edit preservation, idempotency,
atomic availability, token reuse, worker permissions, throttling, session checks,
active/inactive filters, and quarantine precedence under descending sort.
