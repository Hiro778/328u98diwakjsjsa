MOBILE RESPONSIVE FIX ONLY — DO NOT CHANGE DESKTOP UI

Context:
Desktop BisnisSehat saat ini sudah terlihat bagus.
Mobile pada viewport sekitar 390px masih banyak masalah:
- horizontal overflow
- beberapa content terpotong
- pricing cards terlalu desktop-oriented
- QR Menu / Simulator masih terasa fixed-width
- notification dropdown terlalu lebar
- beberapa teks terlalu low-contrast
- spacing/header belum optimal untuk mobile

IMPORTANT SCOPE LOCK:
- Fokus ONLY viewport mobile.
- Jangan redesign desktop.
- Jangan mengubah business logic.
- Jangan mengubah Supabase/RLS/RPC/API.
- Jangan mengubah QRIS/payment/order logic.
- Jangan mengubah Admin RBAC.
- Jangan mengubah desktop visual hierarchy.
- Jangan mengganti design system secara global.
- Jangan melakukan refactor besar.

TARGET:
Mobile widths:
- 360px
- 390px
- 412px
Desktop regression:
- 1280px
- 1440px

TASK:

1. Audit global responsive CSS/layout:
   - fixed width
   - min-width
   - width > viewport
   - fixed positioning
   - absolute positioning
   - overflow-x
   - grid columns
   - flex rows
   - large desktop paddings
   - hardcoded card widths

2. Fix horizontal overflow FIRST.
   Mobile page must not require horizontal scrolling.

3. Fix mobile app header:
   - hamburger stays accessible
   - logo/title fits
   - notification/profile controls don't overflow
   - preserve existing desktop header.

4. Fix pricing/top-up cards:
   - mobile width: calc(100vw - 32px) or equivalent container width
   - internal padding responsive
   - buttons full-width where appropriate
   - text remains readable
   - preserve desktop appearance.

5. Fix notification dropdown:
   - mobile width must fit viewport
   - use approximately calc(100vw - 32px)
   - max-width for larger screens
   - prevent clipping/overflow
   - preserve desktop dropdown.

6. Fix QR Menu / Simulator:
   - mobile preview must fit 360/390/412px viewport
   - no horizontal overflow
   - simulator controls wrap appropriately
   - preview/canvas scales to available width
   - QR remains readable
   - product cards fit inside preview
   - desktop simulator remains unchanged.

7. Fix mobile typography/readability:
   - identify text that becomes too dark/low contrast
   - preserve existing color system
   - do NOT randomly change all colors.

8. Use CSS media queries/container queries where appropriate instead of JS viewport hacks.

9. Add/extend responsive regression tests if the project already has them.
   At minimum verify:
   - no obvious fixed-width overflow at 360px
   - pricing card width
   - notification panel width
   - simulator width
   - mobile header layout.

10. Run:
   npm run build

11. If possible run the existing test suite relevant to affected components.

12. Final report:
   - exact files changed
   - exact mobile problems fixed
   - desktop behavior preserved
   - test results
   - build result

STOP after this task.
