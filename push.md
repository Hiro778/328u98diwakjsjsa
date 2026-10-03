GIT COMMIT + PUSH ONLY — DO NOT MODIFY SOURCE CODE

Current state:

Branch:
main

HEAD:
031d667 fix: resolve missing credit page imports

origin/main:
031d667

git push says:
Everything up-to-date

BUT git status contains many modified and untracked files.
Therefore recent implementation work exists only in the working tree and
has NOT been committed/pushed.

GOAL:
Safely commit intended application changes and push them to origin/main.

DO NOT edit/refactor/fix any application code in this task.

==================================================
1. AUDIT WORKING TREE
==================================================

Run:

git status
git diff --stat
git diff --name-only
git ls-files --others --exclude-standard

Classify every changed/untracked file into:

A. APPLICATION SOURCE
B. TEST
C. SUPABASE FUNCTION
D. SUPABASE MIGRATION
E. DOCUMENTATION/WORK NOTES
F. TEMPORARY/GENERATED

Do NOT lose any existing work.

==================================================
2. IMPORTANT TEMP FILE
==================================================

Do NOT commit:

supabase/.temp/cli-latest

Also inspect for:
- .env
- .env.*
- secrets
- service role keys
- API keys
- generated build output
- node_modules
- temporary files

Never commit secrets.

==================================================
3. MIGRATION COLLISION CHECK — CRITICAL
==================================================

There are currently at least:

097_credit_activation_links.sql
097_two_tier_pricing_entitlement.sql

This is a duplicate Supabase migration version.

DO NOT blindly commit/push duplicate migration versions.

Inspect existing migration history and determine the correct next unique
migration numbering.

Do not change migration SQL behavior.

If renaming is necessary solely to make migration versions unique, report
exactly what was renamed and why.

Do NOT apply migrations during this task.

==================================================
4. VERIFY INTENDED CODE CHANGES
==================================================

Recent intended work includes changes related to:

- maintenance mode / MaintenanceGate
- SettingsProvider regression
- Basic/Pro pricing/entitlement
- subscription gates
- admin subscription UI
- AI credit purchase/activation
- AI feature entitlement/security
- SEO/OpenSEO integration
- Supabase Edge Functions
- security hardening
- associated tests

Do NOT discard these merely because origin/main doesn't contain them.

But inspect diffs before staging.

==================================================
5. DOCUMENTATION FILES
==================================================

Files such as:

13.md
14.md
gas12.md
load.md
phase12.md
phase2.md
phase3.md
ver.md
fix.md
gas.md
sec.md

may be agent prompts/reports rather than production application files.

Do not automatically commit new work-note markdown files unless they are
intentionally part of the repository.

Preserve them locally even if they are not staged.

Do not delete them.

==================================================
6. SETTINGS PROVIDER FIX
==================================================

Verify App.jsx currently contains:

<ThemeProvider>
  <AuthProvider>
    <SettingsProvider>
      <RouterProvider router={router} />
    </SettingsProvider>
  </AuthProvider>
</ThemeProvider>

If yes, ensure that exact existing change is included in the commit if it
is not already in HEAD.

DO NOT edit it.

==================================================
7. SECRET SCAN BEFORE COMMIT
==================================================

Inspect staged files for accidental:

SUPABASE_SERVICE_ROLE_KEY
MIDTRANS_SERVER_KEY
GEMINI_API_KEY
DATAFORSEO credentials
JWT secrets
private API tokens
.env contents

Configuration variable names are okay.
Actual secret values are NOT.

If an actual secret is found:
STOP and report it.
Do not commit/push.

==================================================
8. STAGE INTENDED FILES
==================================================

Stage only legitimate source code, migrations, functions, and tests.

Exclude:
- supabase/.temp/*
- generated files
- local environment files
- irrelevant work-note markdown unless intentionally tracked

Do not use destructive git commands.

DO NOT:
git reset --hard
git clean -fd
git checkout .
git restore .

==================================================
9. COMMIT
==================================================

Before commit show:

git diff --cached --stat
git status

Then create ONE commit for the current intended implementation batch.

Suggested message:

feat: integrate platform runtime and security updates

Do not amend previous commits.

==================================================
10. PUSH
==================================================

Push:

git push origin main

Then verify:

git status
git log -3 --oneline
git rev-parse HEAD
git rev-parse origin/main

Expected:

HEAD == origin/main

==================================================
11. FINAL REPORT
==================================================

Report ONLY:

1. files committed
2. files intentionally left uncommitted
3. migration collision found: YES/NO
4. migration rename performed: old -> new, if any
5. secret scan: PASS/FAIL
6. commit hash
7. push: PASS/FAIL
8. local HEAD
9. origin/main
10. HEAD == origin/main: YES/NO
11. remaining git status

Do not change application logic.

STOP.
