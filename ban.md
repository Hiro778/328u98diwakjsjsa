FIX ONLY — BLOCKING BUILD ERROR IN PublicMenuPage.jsx

Current npm run build FAILS:

src/pages/public/PublicMenuPage.jsx:210
Missing catch or finally clause

src/pages/public/PublicMenuPage.jsx:1568
Expected `}` but found `EOF`

IMPORTANT:
This is now the ONLY task.
Do NOT touch Admin Settings runtime enforcement.
Do NOT touch QRIS/POS/payment logic.
Do NOT refactor unrelated code.
Do NOT modify Supabase migrations.
Do NOT modify other files unless absolutely required to fix this syntax error.

TASK:

1. Open and inspect the COMPLETE:
   src/pages/public/PublicMenuPage.jsx

2. Carefully trace all:
   - try/catch/finally blocks
   - if/else blocks
   - function blocks
   - callbacks
   - JSX braces
   - parentheses
   - brackets

3. Identify the EXACT unmatched/malformed structure causing:
   "Missing catch or finally clause" around line 210.

4. Also identify why the exported component reaches EOF with an unmatched `{`.

5. Fix the syntax while PRESERVING the existing business logic exactly.
   Do not rewrite the component unnecessarily.

6. Run:
   npm run build

7. Build MUST reach:
   ✓ built successfully
   or equivalent successful production build.

8. If build still fails, continue debugging PublicMenuPage.jsx until the syntax/build error is resolved.

9. Only after build passes, run the relevant existing PublicMenu/QRIS tests if available.

10. Final report must include:
   - exact root cause
   - exact lines/structure fixed
   - confirmation that QRIS behavior was not changed
   - npm run build result
   - relevant test result

STOP after this task is complete.
