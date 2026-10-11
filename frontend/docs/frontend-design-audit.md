# Frontend Design Audit — Homestay Joglo Seruni Syariah PMS

**Audit date:** 2026-10-09
**Auditor role:** Senior Frontend Engineer / UI/UX Designer / Design Systems Auditor / Accessibility Specialist
**Scope:** `E:\Project\Web\pms-internal\frontend` (read-only inspection; no source code modified)
**Report status:** Final

---

## Section 1 — Executive Summary

### Overall Assessment

The frontend is a **functional, well-architected React 18 + TypeScript + Vite + Tailwind 4 application** with 41 route entries across 21 page components, 42 shared components, and 6 PMS-specific components. It implements a complete hospitality PMS: public website, authentication, dashboard, reservations (wizard + pricing + calendar), rooms, users/roles/permissions, finance (sales, invoices, reports, expenses), and activity log.

The codebase shows **strong engineering fundamentals**: lazy-loaded routes, a centralized permission hook (`usePermissions`), a documented design-token system (`globals.css` + `docs/flat-rework/00-design-tokens.ts`), Zod + React Hook Form validation, and a passing Playwright suite (45/45 per `docs/PLAYWRIGHT_TEST_RESULTS.md`).

However, the audit identified **significant design-system drift, permission-gating gaps, and accessibility deficiencies** that collectively undermine the white/brown hospitality brand direction and create operational risk.

### Strongest Aspects

1. **Design tokens are documented and partially adopted.** `src/index.css:7-86` defines a complete flat-design token set (colors, typography, spacing, radius, shadows) and `docs/flat-rework/00-design-tokens.md` is the canonical reference. Newer components (e.g., `ReservationCard`, `LunasWatermark`) follow it well.
2. **Consistent page architecture.** List pages share a common pattern: `.adm-page`/`.fin-page` container → header → `.res-toolbar` (role="search") → cascading filter → `Table` → `Pagination`. This is a solid foundation.
3. **Good accessibility in newer code.** Filter panels use `role="dialog"`, `aria-expanded`, `aria-controls`, `aria-pressed`; icon buttons carry `aria-label`; the reservation wizard has a proper stepper with `aria-current="step"` and focus-managed error summaries.
4. **Thoughtful reservation wizard.** 3-step flow with per-step validation, guarded cancel (double-confirm when dirty), availability checking, and a pricing panel with same/different nightly rates and DP terms.
5. **Print infrastructure.** Dedicated `invoice-print.css` and `report-print.css` with `@page` rules, `print-color-adjust: exact`, repeating table headers, and a LUNAS watermark component.

### Most Important Issues

| # | Issue | Priority |
|---|-------|----------|
| 1 | **All 7 Button variants render identically** (`#232D36`); the bronze brand color is never used for primary actions, contradicting the brand direction. | P1 |
| 2 | **Action buttons are ungated across the app.** Any user with `*.view` permission can trigger check-in/out/cancel/create/edit/delete. Backend 403s but the UI does not pre-hide, producing confusing failures. | P0 |
| 3 | **Off-palette Tailwind buttons** (`#2563EB` blue, `#DC2626` red, `#000000` black) appear in 5 files, breaking the white/brown brand. | P1 |
| 4 | **Non-token error color `#C85C5C`** used in 10+ files instead of the canonical `#962222`. | P1 |
| 5 | **Form labels are not programmatically associated with inputs** in `UserForm`, `UserRoleForm`, `RoleForm`; no `aria-invalid`/`aria-describedby`. | P1 |
| 6 | **Silent error swallowing** across 7+ pages — API failures produce blank screens or "not found" instead of error states. | P1 |
| 7 | **Calendar requires 700px minimum width** — horizontal scrolling on all mobile viewports. | P1 |
| 8 | **Sidebar is fixed at 240px on all viewports** — no mobile drawer pattern. | P1 |
| 9 | **Hardcoded default password `'password123'`** in `UserForm.tsx:158`. | P0 |
| 10 | **`/invoices/new` route bug** — triggers a reservation fetch with `id='new'`. | P0 |

### Design-System Consistency

**Moderate-to-poor.** Tokens are defined but adoption is inconsistent. Hardcoded hex values (`#232D36`, `#C7BBAB`, `#97764D`, `#6B7881`) appear in nearly every component instead of `var(--color-*)`. Non-token colors (`#C85C5C`, `#E3DED6`, `#F8F6F2`, `#E8E0D4`, `#F2F0EB`, `#F6E1E1`) and non-token radii (`6px`, `4px`, `3px`, `999px`) are scattered across the codebase. The `Button` component's variant system is effectively non-functional.

### Main Responsive Concerns

- Calendar grid: `minWidth: 700px` with `overflowX: auto` (CalendarView.tsx:238) — unusable without horizontal scroll on mobile.
- Sidebar: `position: fixed; width: 240px` at all breakpoints (pms-layout.css:19) — consumes 64% of a 375px viewport.
- `globals.css:222-232` reduces `html` font-size to 14px/13px on mobile, affecting all `rem`-based sizing globally.
- Tables use `tableLayout: fixed` with `overflowX: auto` — acceptable but column widths are not optimized for small screens.

### Main Accessibility Concerns

- Form label/input association missing in 3 shared form components.
- `Loading` component has no `role="status"`/`aria-live` and injects `<style>` tags.
- `ErrorState` has no `role="alert"` and uses a raw `<button>` instead of the shared `Button`.
- `Modal` has no focus trap and no `aria-labelledby`.
- Calendar grid lacks `role="grid"`; day cells use imperative `onFocus`/`onBlur` instead of `:focus-visible`.
- `role="button"` on `<div>` elements in `FloorMapCard`.
- 11px font sizes in `PermissionCheckboxGrid` (below readable minimum).

### Highest-Priority Recommendations

1. Fix the `Button` component variants so `bronze` renders `#97764D` and `danger` renders a token-based red — this single change repairs brand consistency across the entire app.
2. Gate all mutation actions behind their corresponding permissions (check-in/out, cancel, create, edit, delete) with graceful UI fallbacks.
3. Replace all `#C85C5C` with `var(--color-error-text)` and all off-palette Tailwind buttons with the shared `Button` component.
4. Add `htmlFor`/`id` associations and `aria-invalid`/`aria-describedby` to all form components.
5. Implement a mobile drawer for the sidebar and a responsive calendar layout.

### Audit Limitations

- **No browser rendering, screenshots, or automated accessibility scans were performed.** All findings are **Verified — Source** (confirmed by inspecting the relevant source implementation) or **Unverified Risk** (plausible concern requiring runtime testing). No finding is classified as **Verified — Rendered**.
- The Playwright suite (45/45 passing per `docs/PLAYWRIGHT_TEST_RESULTS.md`) was **not executed** during this audit; results are taken from the existing documentation.
- Backend authorization enforcement was **not verified**; the audit relies on `FRONTEND_CURRENT_STATE.md` §G/M3 which documents that the server returns 403 for unauthorized actions.
- Viewport-specific behavior at 375px, 430px, 768px, 1024px, 1366px, and 1440px was **not tested**; responsive findings are code-based observations.
- Financial calculations and business logic were **not modified or independently verified**.

---

## Section 2 — Repository and Audit Coverage

### Project Root

`E:\Project\Web\pms-internal\frontend`

### Framework and Dependencies

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | React | 18.3.1 |
| Build tool | Vite | 5.4.0 |
| Language | TypeScript | 5.6.3 (strict) |
| Routing | React Router DOM | 6.26.0 |
| Styling | Tailwind CSS 4 + custom CSS | 4.0.0 |
| Forms | React Hook Form + Zod | 7.53.0 / 3.24.0 |
| Dates | date-fns | 3.6.0 |
| Icons | lucide-react | 0.446.0 |
| PDF generation | jspdf + jspdf-autotable | 4.2.1 / 5.0.8 |
| Excel export | xlsx | 0.18.5 |
| E2E testing | @playwright/test | 1.63.0 |
| Linting | ESLint 9 + Prettier 3 | — |

### Routing Approach

React Router 6 `createBrowserRouter` with nested route trees. Three layout shells:
- `PublicLayout` — public website pages (Home, About, Rooms, Gallery, Contact)
- `PublicOnlyRoute` — auth pages (Login, Register, Forgot/Reset Password) redirect authenticated users to `/dashboard`
- `ProtectedRoute` → `PMSLayout` — all authenticated PMS pages with sidebar navigation

Route-level permission guards use `<RequirePermission permission="..." anyOf={[...]} />`. All PMS routes are lazy-loaded with a shared `LoadingFallback`.

### Styling Approach

Hybrid: Tailwind 4 (via `@tailwindcss/vite` plugin) + 14 custom CSS files in `src/styles/` + extensive inline styles. Design tokens are defined as CSS custom properties in `src/index.css:7-86` and documented in `docs/flat-rework/00-design-tokens.md`. The canonical palette:

| Token | Value |
|-------|-------|
| `--color-canvas` | `#EEEDE9` |
| `--color-surface` | `#FFFFFF` |
| `--color-surface-muted` | `#F2F0EB` |
| `--color-line` | `#C7BBAB` |
| `--color-ink` | `#232D36` |
| `--color-slate` | `#6B7881` |
| `--color-bronze` | `#97764D` |
| `--color-bronze-dark` | `#7D6240` |
| `--color-error-text` | `#962222` |
| `--color-success-text` | `#2F5D37` |
| `--color-warning-text` | `#7A5A1E` |
| `--color-info-text` | `#2F4A5E` |

### Available Testing and Rendering Tools

- **Playwright** (`@playwright/test` 1.63.0) with config at `playwright.config.ts`; 9 test suites (SCN-01 through SCN-09) documented in `docs/PLAYWRIGHT_TEST_PLAN.md`; last recorded run 45/45 passed (`docs/PLAYWRIGHT_TEST_RESULTS.md`).
- **Vitest** (backend only; no frontend unit tests).
- **ESLint 9** with `eslint-plugin-react-hooks`; `npm run lint` reports 19 errors + 96 warnings (pre-existing, per `FRONTEND_CURRENT_STATE.md` §G.1).
- **TypeScript** `tsc --noEmit` → 0 errors (per `FRONTEND_CURRENT_STATE.md` §G.1).
- **No browser automation, screenshot capture, or automated accessibility scanning tools were available or used during this audit.**

### Pages and Components Inspected

**All 21 page components** (100% coverage):
- Public: `HomePage`, `AboutPage`, `RoomTypesPage`, `GalleryPage`, `ContactPage`
- Auth: `LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `ChangePasswordPage`, `NotFoundPage`
- PMS: `DashboardPage`, `ReservationListPage`, `ReservationFormPage`, `ReservationDetailPage`, `ReservationCalendarPage`, `RoomListPage`, `RoomFormPage`, `RoomTypeListPage`, `RoomTypeFormPage`, `UserListPage`, `UserFormPage`, `UserRolePage`, `UserDetailPage`, `ManagementPage`, `RoleListPage`, `RoleFormPage`, `PermissionListPage`, `ActivityLogPage`, `SalesPage`, `InvoiceListPage`, `InvoiceDetailPage`, `InvoiceFormPage`, `ReportPage`, `ExpensesPage`

**All 42 shared components** in `src/components/shared/` and **all 6 PMS components** in `src/components/pms/`.

**All 3 layouts**, **14 CSS files**, **3 hooks**, **3 stores**, **API client**, and **design-token documentation**.

### Pages or Components That Could Not Be Inspected

None. All frontend source files were inspected.

### Testing Methods Actually Performed

1. **Source code inspection** — every page, component, layout, hook, store, service, and CSS file was read and analyzed.
2. **Design-token cross-reference** — inline styles and CSS rules were compared against the canonical token set.
3. **Permission-flow tracing** — `usePermissions` / `hasPermission` usage was traced from route guards through page-level action gating.
4. **Duplicate-code detection** — repeated patterns (filter cascades, status maps, button styles, CTA styles) were identified across files.
5. **Documentation review** — `FRONTEND_CURRENT_STATE.md`, `docs/flat-rework/00-design-tokens.md`, `docs/PLAYWRIGHT_TEST_PLAN.md`, `docs/PLAYWRIGHT_TEST_RESULTS.md` were read.

**Not performed:** browser rendering, screenshot capture, Playwright execution, automated accessibility scanning (e.g., axe), keyboard-only navigation testing, screen-reader testing.

---

## Section 3 — Page and Route Inventory

| Page / Feature | Route | Main Purpose | Audit Coverage | Key Findings |
|----------------|-------|--------------|----------------|--------------|
| HomePage | `/` | Public landing page with hero, availability checker, rooms, carousel | Full | Placeholder WhatsApp; no loading/empty/error states for room fetch |
| AboutPage | `/about` | About the homestay | Full | Placeholder content; duplicated CTA styles; no focus styles |
| RoomTypesPage | `/rooms` | Public room type listing | Full | Placeholder; duplicated CTA styles |
| GalleryPage | `/gallery` | Photo gallery | Full | Placeholder; duplicated CTA styles |
| ContactPage | `/contact` | Contact information | Full | Placeholder contact info; sticky button overlap risk |
| LoginPage | `/login` | Staff login | Full | No client-side validation; inline Button override |
| RegisterPage | `/register` | Staff registration | Full | Basic email regex; no password strength indicator |
| ForgotPasswordPage | `/forgot-password` | Request password reset | Full | Dev reset link exposure risk; no email validation |
| ResetPasswordPage | `/reset-password` | Set new password | Full | No catch block; token not validated |
| ChangePasswordPage | `/change-password` | Change own password | Full | Labels not associated; no h1; non-token colors; no AuthSplitLayout |
| NotFoundPage | `*` | 404 page | Full | Minimal; no logo/footer |
| DashboardPage | `/dashboard` | Operational overview: stats, charts, quick actions | Full | Permission-gated cards; silent error; hardcoded dates; marquee |
| ReservationListPage | `/dashboard/reservations` | Reservation list with filters | Full | No action gating; non-token error color; filter cascade duplication |
| ReservationFormPage | `/dashboard/reservations/new`, `/dashboard/reservations/:id/edit` | Create/edit reservation | Full | No permission gating; inconsistent max-width |
| ReservationDetailPage | `/dashboard/reservations/:id` | Reservation detail + actions | Full | Actions ungated; silent error; "not found" conflates with error |
| ReservationCalendarPage | `/dashboard/reservations/calendar` | Monthly calendar view | Full | 700px min-width; header missing flexWrap; filter cascade duplication |
| RoomListPage | `/dashboard/rooms` | Room inventory with floor map | Full | Off-palette action buttons; no permission gating |
| RoomFormPage | `/dashboard/rooms/new`, `/dashboard/rooms/:id/edit` | Create/edit room | Full | No permission gating; hard-coded route |
| RoomTypeListPage | `/dashboard/room-types` | Room type list | Full | Not paginated; off-palette buttons; no permission gating |
| RoomTypeFormPage | `/dashboard/room-types/new`, `/dashboard/room-types/:id/edit` | Create/edit room type | Full | No permission gating; hard-coded route |
| UserListPage | `/dashboard/users` | User management list | Full | Ungated "Add User"; nested interactive elements; off-palette buttons |
| UserFormPage | `/dashboard/users/new` | Create user | Full | No permission gating |
| UserRolePage | `/dashboard/users/:id/edit` | Assign role to user | Full | No permission gating; silent error |
| UserDetailPage | `/dashboard/users/:id` | User detail view | Full | No permission gating; no error state |
| ManagementPage | `/dashboard/management` | Tabbed admin (Users/Roles/Permissions) | Full | Tabs permission-gated; missing aria-controls/aria-labelledby |
| RoleListPage | `/dashboard/roles` | Role list | Full | No permission gating; non-standard hoverStyle prop |
| RoleFormPage | `/dashboard/roles/new`, `/dashboard/roles/:id/edit` | Create/edit role | Full | No permission gating |
| PermissionListPage | `/dashboard/permissions` | Permission catalog | Full | No error state; ✓/✗ characters; no page-level gate |
| ActivityLogPage | `/dashboard/activity` | Activity feed | Full | No loading state; no permission gating; filter button missing aria |
| SalesPage | `/dashboard/finance`, `/dashboard/finance/sales` | Sales & revenue dashboard | Full | Hardcoded dates; no permission gating; no loading state |
| InvoiceListPage | `/dashboard/finance/invoices` | Invoice list | Full | Off-palette buttons; silent error; no permission gating |
| InvoiceDetailPage | `/dashboard/finance/invoices/:id` | Invoice detail + print | Full | navigate(0) refresh; no permission gating |
| InvoiceFormPage | `/dashboard/finance/invoices/new`, `/:id/edit` | Create/edit invoice | Full | Route bug with id='new'; silent error; no permission gating |
| ReportPage | `/dashboard/finance/reports` | Financial report + export | Full | Hardcoded dates; non-token colors; no permission gating |
| ExpensesPage | `/dashboard/finance/expenses` | Expense list + create | Full | No delete; no feedback after create; no permission gating |

**Total: 41 route entries across 21 page components.**

---

## Section 4 — Design System Audit

### 4.1 Color Inconsistencies

**Canonical tokens** (`src/index.css:7-28`): `--color-canvas #EEEDE9`, `--color-line #C7BBAB`, `--color-ink #232D36`, `--color-slate #6B7881`, `--color-bronze #97764D`, `--color-error-text #962222`.

**Non-token colors in use:**

| Color | Token Equivalent | Files |
|-------|-----------------|-------|
| `#C85C5C` | `--color-error-text #962222` | `config/app.ts:39,108`, `constants/reservationStatuses.ts:21`, `constants/expenseCategories.ts:17`, `utils/statusUtils.ts:6,12`, `ReservationListPage.tsx:596`, `UserListPage.tsx:302`, `RoleListPage.tsx:271`, `UserForm.tsx:184,188,193,199`, `UserRoleForm.tsx:131`, `UserPermissionForm.tsx:151`, `RoleForm.tsx:99,103,108`, `ReservationWizardModal.tsx:71-72`, `ReservationFormPanel.tsx:63`, `ReservationForm.tsx:189` |
| `#2563EB` | None (Tailwind blue-600) | `InvoiceListPage.tsx:232`, `InvoiceDetailPopup.tsx:66`, `RoomListPage.tsx:202`, `RoomTypeListPage.tsx:163`, `UserListPage.tsx:140` |
| `#DC2626` | None (Tailwind red-600) | `InvoiceListPage.tsx:242`, `InvoiceDetailPopup.tsx:76`, `RoomListPage.tsx:212`, `RoomTypeListPage.tsx:173`, `UserListPage.tsx:131`, `PMSLayout.tsx:256,292` |
| `#000000` | `--color-ink #232D36` | Hover states in all files using `#2563EB`/`#DC2626` buttons |
| `#E3DED6` | `--color-line #C7BBAB` | `RoomOccupancyPopup.tsx:70,83,91`, `FloorMapCard.tsx:192` |
| `#F8F6F2` | `--color-canvas #EEEDE9` | `FloorMapCard.tsx:191,221` |
| `#E8E0D4` | None | `FloorMapCard.tsx:262` |
| `#F2F0EB` | `--color-surface-muted #F2F0EB` (close but not exact) | `InvoiceFormPage.tsx:93`, `InvoiceDetailPopup.tsx:117` |
| `#F6E1E1` | `--color-error-bg #F3DEDE` | `config/app.ts:108`, `utils/statusUtils.ts:6,12` |
| `#756A61` | None | `ConfirmDialog.tsx:50` (fallback) |

**Impact:** The white/brown brand direction is visibly broken. Users see blue edit buttons, red delete buttons, and pure-black hover states — none of which exist in the brand palette. The bronze accent color (`#97764D`) is reserved for table headers and links but never appears on primary action buttons.

### 4.2 Typography Issues

- **11px font sizes** in `PermissionCheckboxGrid.tsx:73,104,114` — below the 12px caption minimum and difficult to read.
- **8px font size** in `FloorMapCard.tsx:218` (category labels on floor map) — illegible.
- **Conditional font size** `area.w > 15 ? '14px' : '11px'` in `FloorMapCard.tsx:278` — inconsistent.
- **Inconsistent heading sizes:** h1 is 24px on most pages but 20px on finance pages (`.fin-h1` in finance-responsive.css) and 28px in auth (`.auth-heading`).
- **Mobile font-size reduction** in `globals.css:222-232` (`html { font-size: 14px }` at ≤768px, `13px` at ≤480px) affects all `rem` units globally — may cause unintended scaling.

### 4.3 Spacing Inconsistencies

- **Max-width inconsistency:** `1400px` (Dashboard, ReservationList, ReservationCalendar, RoomList, RoomTypeList), `1200px` (finance pages, public pages), `1000px` (ReservationForm, ReservationDetail), `900px` (InvoiceDetail, InvoiceForm), `800px` (RoomForm, RoomTypeForm). No clear rationale for the variation.
- **Magic numbers:** `padding: '40px'` (ReservationListPage.tsx:615), `minWidth: '24px', maxWidth: '100px'` (ReservationFormPage.tsx:19), `maxWidth: '120px'` (ReservationDetailPage.tsx:176), `gap: '4px'` in multiple toolbars.
- **Arbitrary padding** `padding: '30px 12px 12px 12px'` in `RoomSelector.tsx:147` — hacky top padding to clear a badge.

### 4.4 Border and Shadow Inconsistencies

- **Non-token radii:** `6px` (FloorMapCard.tsx:170,193; RoomListPage.tsx:202,212), `4px` (FloorMapCard.tsx:208,264,333), `3px` (FloorMapCard.tsx:333), `999px` pill (FloorMapCard.tsx:318,349; dashboard-modern.css:326,332; reservation-boards.css:57,63), `0 8px 8px 0` asymmetric (ReservationDetailPage.tsx:224).
- **Non-token shadow:** `boxShadow: '0 8px 24px rgba(35,45,54,0.25)'` in `RoomOccupancyPopup.tsx:36` — the design system specifies "flat: none except pop" (`--shadow-pop: 0 1px 2px rgba(35,45,54,0.12)`).
- **Non-token border color:** `#E3DED6` used for dividers in `RoomOccupancyPopup.tsx:70,83,91` and `FloorMapCard.tsx:192` instead of `--color-line #C7BBAB`.

### 4.5 Button and Input Inconsistencies

**Critical: Button variant system is non-functional.** `Button.tsx:43-79` defines 7 variants (`primary`, `secondary`, `outline`, `bronze`, `ghost`, `danger`, `disabled`) but **all render identically** with `backgroundColor: '#232D36'`, `color: '#FFFFFF'`, `borderColor: '#232D36'`. The `bronze` variant — which should be the brand primary — is indistinguishable from `primary`. Only the `disabled` variant differs. Hover states use `#97764D` (bronze) for all variants, creating an inconsistent experience where every button turns bronze on hover regardless of its variant.

**Off-palette buttons:** 5 files bypass the `Button` component entirely and hardcode Tailwind colors (`#2563EB`, `#DC2626`, `#000000`) with `onMouseEnter`/`onMouseLeave` handlers instead of CSS `:hover`.

**Input consistency:** `Input.tsx` and `Select.tsx` are well-implemented with consistent 44px height, 8px radius, and token-based borders. However, `ChangePasswordPage.tsx` uses raw `<input>` elements instead of the shared `Input` component, and `RoleForm.tsx:107` uses a raw `<textarea>` instead of `Textarea`.

### 4.6 Card, Table, and Modal Inconsistencies

- **Card:** `Card.tsx` is consistent (white bg, 8px radius, 1px `#C7BBAB` border). However, `raised` prop is accepted but ignored (`raised: _raised = false` at Card.tsx:14) — dead code.
- **Table:** `Table.tsx` uses `tableLayout: fixed` with centered text alignment for all cells — numeric columns (amounts, dates) would be better right-aligned. Header is always bronze (`#97764D`) with white uppercase text. Zebra striping alternates `#FFFFFF` / `#F2F0EB`.
- **Modal:** `Modal.tsx` has no focus trap, no `aria-labelledby`, and uses `maxHeight: 85vh` with `overflow: auto` — content can scroll internally without a sticky header. The `full` size sets `width: '100vw'` which ignores the `maxWidth: '94vw'` constraint.

### 4.7 Icon and Status-Indicator Inconsistencies

- **Icon sizes:** 20px (sidebar), 16px (sub-nav), 18px (modal close), 12px (select chevron) — reasonable but not tokenized.
- **Status colors:** The status palette (success/warning/danger/info) is defined in tokens but hardcoded in `CalendarView.tsx:26-31`, `DashboardPage.tsx:219-222`, `ReservationListPage.tsx:20-24`, `ReservationCalendarPage.tsx:14-19`. The `statusVariantMap` is duplicated in 3 files.
- **Holiday marker color:** `HOLIDAY_BAR_COLOR = '#962222'` (CalendarView.tsx:40) uses danger red for holidays — semantically incorrect; holidays are not errors.

### 4.8 Branding Issues

- **Logo:** `LogoWhite.png` is used in `PMSLayout` sidebar and `HomePage` hero. `LogoBrown.png` is used in `InvoicePrintDocument.tsx:7` via a fragile relative import (`../../../assets/LogoBrown.png`).
- **Brand color underutilization:** Bronze (`#97764D`) appears in table headers, links, and hover states but never as a primary button fill — the single most impactful brand element is missing.
- **Placeholder content:** WhatsApp number `6200000000000` is hardcoded across all public pages. Contact page has no actual phone/address/hours.
- **Footer:** `PMSLayout` has a minimal footer (`© 2027 Homestay Joglo Seruni Syariah`). Public pages have an empty footer placeholder in `PublicLayout.tsx:22-30`.

### 4.9 Opportunities for Shared Design Tokens

1. **Replace all hardcoded hex values with `var(--color-*)` references.** The tokens exist; they are simply not used. This is a mechanical but high-impact change.
2. **Fix the `Button` component** to actually differentiate variants. This single change would repair brand consistency across the entire application.
3. **Extract a shared `ActionButton` component** for the off-palette edit/delete buttons that bypass `Button`.
4. **Tokenize icon sizes** in a single constant.
5. **Create a shared `PageHeader` component** to eliminate the repeated flex-header-with-spacer pattern.

---

## Section 5 — Page-by-Page Findings

### 5.1 Public Pages

#### HomePage (`/`)
- **Purpose:** Public landing page with hero, availability checker, welcome section, room cards, photo carousel, reserve CTA.
- **Strengths:** Strong accessibility (aria-labelledby on all sections, label/htmlFor associations, error summary with role="alert" and focus management, carousel with keyboard nav). Good use of `Button` with `variant="bronze"`.
- **Issues:**
  - WhatsApp number is placeholder `6200000000000` (HomePage.tsx:21).
  - Room fetch has no loading spinner, no empty state, and silently swallows errors (HomePage.tsx:39-52).
  - Error summary uses `<h2>` duplicating heading level (HomePage.tsx:160).
  - No footer/copyright.
- **Priority:** P3 (placeholder content is a business decision, not a design defect).
- **Effort:** S
- **Confidence:** Verified — Source

#### AboutPage (`/about`), RoomTypesPage (`/rooms`), GalleryPage (`/gallery`)
- **Purpose:** Placeholder content pages.
- **Strengths:** Consistent layout, proper aria-labelledby, token-conformant colors.
- **Issues:**
  - `ctaStyle`/`handleCtaEnter`/`handleCtaLeave` duplicated verbatim across all 4 public pages (AboutPage.tsx:5-33, RoomTypesPage.tsx:5-33, GalleryPage.tsx:5-33, ContactPage.tsx:5-33).
  - No focus styles — only mouse enter/leave/up/down handlers (AboutPage.tsx:57-70).
  - Placeholder text "akan ditampilkan di sini" (AboutPage.tsx:48).
  - No logo, no copyright.
- **Priority:** P2 (duplication), P3 (placeholder content).
- **Effort:** S
- **Confidence:** Verified — Source

#### ContactPage (`/contact`)
- **Purpose:** Contact information.
- **Strengths:** Proper aria-labels, token-conformant row styles, 44px touch targets.
- **Issues:**
  - Sticky WhatsApp button with `zIndex: 1` risks overlapping content on mobile (ContactPage.tsx:58).
  - Placeholder contact info — no actual phone, address, or hours (ContactPage.tsx:82,86,90).
  - Same CTA duplication as other public pages.
- **Priority:** P3
- **Effort:** S
- **Confidence:** Verified — Source

### 5.2 Authentication Pages

#### LoginPage (`/login`)
- **Purpose:** Staff login.
- **Strengths:** Proper input labels, autoComplete attributes, error role="alert", remember checkbox labeled.
- **Issues:**
  - Inline style overrides Button variant (LoginPage.tsx:62) — could use `variant="bronze"`.
  - No client-side validation (only server-side error display).
  - No focus management on error.
- **Priority:** P3
- **Effort:** S
- **Confidence:** Verified — Source

#### RegisterPage (`/register`)
- **Purpose:** Staff registration.
- **Strengths:** Client-side validation (name ≥2, email regex, password ≥6, confirm match), proper error display via Input props.
- **Issues:**
  - Basic email regex (RegisterPage.tsx:17).
  - No password strength indicator.
  - No focus management on validation errors.
- **Priority:** P3
- **Effort:** S
- **Confidence:** Verified — Source

#### ForgotPasswordPage (`/forgot-password`)
- **Purpose:** Request password reset.
- **Strengths:** Proper role="status" on feedback, disabled submit when empty.
- **Issues:**
  - Dev reset link exposed in UI (ForgotPasswordPage.tsx:25-27) — security risk if `DEV_EXPOSE_RESET_TOKEN` leaks to production.
  - No email format validation.
- **Priority:** P2 (security risk requires verification of env gating).
- **Effort:** S
- **Confidence:** Verified — Source

#### ResetPasswordPage (`/reset-password`)
- **Purpose:** Set new password.
- **Strengths:** Client-side validation (match, ≥6 chars), role="status" on feedback.
- **Issues:**
  - No `catch` block — only `finally` — unhandled promise rejection if `resetPassword` throws (ResetPasswordPage.tsx:22-26).
  - Token from URL not validated before rendering form.
  - `setTimeout` redirect with no cleanup.
- **Priority:** P2
- **Effort:** S
- **Confidence:** Verified — Source

#### ChangePasswordPage (`/change-password`)
- **Purpose:** Change own password (authenticated).
- **Strengths:** Client-side validation, role="status"/role="alert" on feedback.
- **Issues:**
  - Labels not associated with inputs via `htmlFor`/`id` — only `<label>` without htmlFor (ChangePasswordPage.tsx:53-62).
  - Non-token colors: `#E3EDE4`, `#2F5D37`, `#962222` (ChangePasswordPage.tsx:50,64).
  - Does not use `AuthSplitLayout` — inconsistent with other auth pages.
  - No h1 heading (h2 only).
  - `minHeight: 100vh` + padding can overflow.
- **Priority:** P2
- **Effort:** S
- **Confidence:** Verified — Source

#### NotFoundPage (`*`)
- **Purpose:** 404 page.
- **Issues:** No logo, no footer, very minimal.
- **Priority:** P3
- **Effort:** S
- **Confidence:** Verified — Source

### 5.3 Dashboard (`/dashboard`)

- **Purpose:** Operational overview — KPI stat cards, revenue chart, occupancy donut, invoice summary, recent reservations, quick actions.
- **Strengths:**
  - Permission-gated stat cards and quick actions via `usePermissions()` (DashboardPage.tsx:69,247,283).
  - Good accessibility: aria-roledescription="carousel", aria-labelledby on sections, role="img" + aria-label on charts, aria-hidden on decorative icons.
  - Responsive: 1-col mobile → 12-col at ≥1024px, 3-col tiles at ≥640px.
  - Reduced-motion support: marquee becomes flex-wrap.
- **Issues:**
  - **Silent error:** API failure sets `overview` to `null` and renders zero values with no error indication (DashboardPage.tsx:79-81).
  - **Hardcoded dates:** `revenueMonthStart = '2026-06'`, `revenueMonthEnd = '2026-09'` (DashboardPage.tsx:94-95) — initial state values that will become stale.
  - **Marquee animation:** Stat cards are duplicated in DOM for a seamless loop (DashboardPage.tsx:308-337) — doubles DOM size.
  - **Filter mode buttons** lack `aria-pressed` (DashboardPage.tsx:376-391).
  - **Month input labels** not associated with inputs via `htmlFor`/`id` (DashboardPage.tsx:407,416).
  - **No validation** on custom date range (start could be after end).
  - **Non-token colors** hardcoded throughout (DashboardPage.tsx:219-222, 250, 271-272, 354, 412, 440-441, 483, 501-502, 533, 551, 555, 559).
  - **Magic numbers:** `donutR = 54` (DashboardPage.tsx:258), animation delays.
- **Priority:** P1 (silent error, hardcoded dates), P2 (accessibility gaps).
- **Effort:** M
- **Confidence:** Verified — Source

### 5.4 Reservation Management

#### ReservationListPage (`/dashboard/reservations`)
- **Purpose:** Full reservation list with cascading filters, search, quick date ranges, status distribution chart, pagination.
- **Strengths:**
  - Excellent filter accessibility: role="search", aria-expanded/aria-controls, role="dialog" on filter panel, aria-pressed on options, aria-label on search input.
  - Responsive card grid: auto-fill minmax(240px, 1fr) → 3-col at ≤1023px → 2-col at ≤640px.
  - Bottom-sheet filter pattern on mobile (reservation-list.css:412-536).
- **Issues:**
  - **No permission gating:** "New Reservation" button visible to all users with `reservation.view` (ReservationListPage.tsx:370).
  - **Non-token error color** `#C85C5C` (ReservationListPage.tsx:596).
  - **Filter cascade logic duplicated** almost identically in ReservationCalendarPage (~80 lines each).
  - **No loading spinner** — only "Loading reservations..." text.
  - **pageSize = 8** with no UI to change it (ReservationListPage.tsx:150).
  - **setTimeout 60ms** magic number (ReservationListPage.tsx:163).
- **Priority:** P1 (permission gating), P2 (duplication, non-token color).
- **Effort:** M
- **Confidence:** Verified — Source

#### ReservationFormPage (`/dashboard/reservations/new`, `/:id/edit`)
- **Purpose:** Thin wrapper for `ReservationFormPanel` → `ReservationWizard`.
- **Issues:**
  - No permission gating for create vs. edit.
  - Inconsistent max-width (1000px vs Dashboard's 1400px).
  - Magic numbers in spacer div (ReservationFormPage.tsx:19).
- **Priority:** P2
- **Effort:** S
- **Confidence:** Verified — Source

#### ReservationDetailPage (`/dashboard/reservations/:id`)
- **Purpose:** View reservation details, check-in/check-out/cancel actions, edit via modal.
- **Strengths:**
  - Responsive info grid: `repeat(auto-fit, minmax(200px, 1fr))`.
  - Proper aria-label on icon-only edit button.
  - ConfirmDialog for destructive actions.
- **Issues:**
  - **Actions ungated:** Check In, Check Out, Cancel, Edit buttons shown based on `reservation.status` only — NOT on user permissions (ReservationDetailPage.tsx:144,283,296,310,313). Any user with `reservation.view` can attempt all actions.
  - **Silent error:** API failure sets `reservation` to `null` and shows "Reservation not found" instead of an error message (ReservationDetailPage.tsx:42-46).
  - **No aria-live** for action feedback.
  - **statusVariantMap duplicated** from ReservationStatusBadge.tsx:4-9 and DayReservationsPopup.tsx:22-27.
  - **Magic numbers:** `minWidth: '24px', maxWidth: '120px'` (ReservationDetailPage.tsx:176).
- **Priority:** P0 (ungated actions), P1 (silent error).
- **Effort:** M
- **Confidence:** Verified — Source

#### ReservationCalendarPage (`/dashboard/reservations/calendar`)
- **Purpose:** Monthly calendar view with room/status filters, holiday markers, day popup.
- **Strengths:**
  - Good filter accessibility (same pattern as ReservationListPage).
  - Holiday data integration with graceful degradation (3 states: unavailable / no data / no holidays).
  - Deep-linkable via `?month=YYYY-MM`.
- **Issues:**
  - **700px minimum width** with `overflowX: auto` (CalendarView.tsx:238) — horizontal scroll on mobile.
  - **Header missing `flexWrap: 'wrap'`** — title and subtitle will overflow on narrow screens (ReservationCalendarPage.tsx:196).
  - **Filter cascade duplicated** from ReservationListPage.
  - **No permission checks.**
  - **Silent error:** `setEntries([])` / `setRooms([])` on failure (ReservationCalendarPage.tsx:129,135).
  - **Calendar grid lacks `role="grid"`** (CalendarView.tsx:238).
  - **Holiday marker uses danger red** `#962222` (CalendarView.tsx:40) — semantically incorrect.
  - **Focus outline via imperative onFocus/onBlur** instead of CSS `:focus-visible` (CalendarView.tsx:283-289).
- **Priority:** P1 (responsive, permission gating), P2 (accessibility, duplication).
- **Effort:** M
- **Confidence:** Verified — Source

### 5.5 Room Management

#### RoomListPage (`/dashboard/rooms`)
- **Purpose:** Room inventory grid with floor-map selection, pagination, filters.
- **Strengths:**
  - Two-column layout: FloorMapCard (left) + Table (right).
  - Good filter accessibility.
  - Responsive: collapses to 1 column at ≤1024px.
- **Issues:**
  - **Off-palette action buttons:** `#2563EB` edit, `#DC2626` delete, `#000000` hover (RoomListPage.tsx:202-214).
  - **Non-token radius** `6px` on action buttons (RoomListPage.tsx:202,212).
  - **No permission gating** — relies solely on route-level `room.view`.
  - **Silent fetch failures** in RoomForm edit mode (RoomForm.tsx:71-73).
  - **`overflow: 'hidden'`** on table wrapper may clip dropdowns/focus rings (RoomListPage.tsx:388).
- **Priority:** P1 (off-palette buttons), P2 (permission gating).
- **Effort:** M
- **Confidence:** Verified — Source

#### RoomFormPage (`/dashboard/rooms/new`, `/:id/edit`)
- **Purpose:** Thin wrapper for `RoomForm`.
- **Issues:** No permission gating; hard-coded route path; onSuccess/onCancel navigate identically.
- **Priority:** P2
- **Effort:** S
- **Confidence:** Verified — Source

#### RoomTypeListPage (`/dashboard/room-types`)
- **Purpose:** Room type list with filters.
- **Issues:**
  - **Not paginated** despite identical structure to RoomListPage (RoomTypeListPage.tsx:332).
  - **Off-palette action buttons** (RoomTypeListPage.tsx:163,173).
  - **No permission gating.**
  - **Description cell** has no max-width — may overflow (RoomTypeListPage.tsx:125).
- **Priority:** P2
- **Effort:** S
- **Confidence:** Verified — Source

#### RoomTypeFormPage (`/dashboard/room-types/new`, `/:id/edit`)
- **Purpose:** Thin wrapper for `RoomTypeForm`.
- **Issues:** No permission gating; hard-coded route.
- **Priority:** P2
- **Effort:** S
- **Confidence:** Verified — Source

### 5.6 User Management and Permissions

#### UserListPage (`/dashboard/users`)
- **Purpose:** User list with search, status filter, pagination, CRUD actions.
- **Strengths:**
  - Partial permission gating: `canView` and `canAssign` checks (UserListPage.tsx:34-35).
  - Good filter accessibility.
- **Issues:**
  - **"Add User" button not gated** — any user can open the create modal (UserListPage.tsx:165).
  - **Nested interactive elements:** `<Link>` wrapping `<button>` — invalid HTML (UserListPage.tsx:129).
  - **Off-palette action buttons** (UserListPage.tsx:131,140,149).
  - **Non-token error color** `#C85C5C` (UserListPage.tsx:302).
  - **No focus management** when modal opens/closes.
- **Priority:** P1 (ungated Add User, nested interactives).
- **Effort:** M
- **Confidence:** Verified — Source

#### UserFormPage (`/dashboard/users/new`)
- **Purpose:** Create user.
- **Issues:** No permission gating; no loading state.
- **Priority:** P2
- **Effort:** S
- **Confidence:** Verified — Source

#### UserRolePage (`/dashboard/users/:id/edit`)
- **Purpose:** Assign role to user.
- **Issues:** No permission gating; silent error (catch sets `exists` to false); plain-text loading.
- **Priority:** P2
- **Effort:** S
- **Confidence:** Verified — Source

#### UserDetailPage (`/dashboard/users/:id`)
- **Purpose:** View user details and effective permissions.
- **Issues:** No permission gating; no error state for failed load; plain-text loading.
- **Priority:** P2
- **Effort:** S
- **Confidence:** Verified — Source

#### ManagementPage (`/dashboard/management`)
- **Purpose:** Tabbed admin combining Users, Roles, Permissions.
- **Strengths:** Tabs filtered by permission (ManagementPage.tsx:18); keyboard navigation with arrow keys; role="tablist"/role="tab"/role="tabpanel".
- **Issues:**
  - Missing `aria-controls` on tabs and `aria-labelledby` on tabpanels.
  - If `visibleTabs` is empty, tabpanel renders nothing — no empty state message.
- **Priority:** P2
- **Effort:** S
- **Confidence:** Verified — Source

#### RoleListPage (`/dashboard/roles`)
- **Purpose:** Role list with search, filter, pagination, edit.
- **Issues:**
  - **No permission checks at all** — any user can create/edit roles (RoleListPage.tsx).
  - **Non-standard `hoverStyle` prop** on Button — does nothing on a DOM element (RoleListPage.tsx:122).
  - **Non-token error color** (RoleListPage.tsx:271).
- **Priority:** P0 (no permission checks).
- **Effort:** M
- **Confidence:** Verified — Source

#### RoleFormPage (`/dashboard/roles/new`, `/:id/edit`)
- **Purpose:** Create/edit role.
- **Issues:** No permission gating.
- **Priority:** P0
- **Effort:** S
- **Confidence:** Verified — Source

#### PermissionListPage (`/dashboard/permissions`)
- **Purpose:** Permission catalog with current user's access status.
- **Issues:**
  - **No error state** — catch block just sets `isLoading` to false (PermissionListPage.tsx:22-24).
  - **✓/✗ characters** not accessible to screen readers (PermissionListPage.tsx:43).
  - **No page-level gate** — anyone can view all permissions.
- **Priority:** P2
- **Effort:** S
- **Confidence:** Verified — Source

#### ActivityLogPage (`/dashboard/activity`)
- **Purpose:** Activity feed with stats, category filter, search, pagination.
- **Issues:**
  - **No loading state** — page appears empty while fetching.
  - **No permission checks.**
  - **Filter button missing** aria-label, aria-expanded, aria-controls (ActivityLogPage.tsx:107-119).
  - **ChevronRight rotated 180°** instead of ChevronLeft (ActivityLogPage.tsx:159).
  - **Non-token error color** `#962222` (ActivityLogPage.tsx:203).
- **Priority:** P1 (no loading state, no permission checks).
- **Effort:** M
- **Confidence:** Verified — Source

### 5.7 Finance

#### SalesPage (`/dashboard/finance`, `/dashboard/finance/sales`)
- **Purpose:** Sales & revenue dashboard with period filter, stats, chart, transaction history.
- **Issues:**
  - **Hardcoded date** `new Date('2026-09-15')` (SalesPage.tsx:29) — will become stale.
  - **Default date range hardcoded** to `'2026-01-01'` / `'2026-09-15'` (SalesPage.tsx:57).
  - **No permission checks.**
  - **No loading state** (synchronous mock data).
  - **Non-token colors** in FLAT_SERIES (SalesPage.tsx:26).
  - **Extensive `any` types** in render functions (SalesPage.tsx:124,131-133,137-140).
- **Priority:** P1 (hardcoded dates, no permission checks).
- **Effort:** M
- **Confidence:** Verified — Source

#### InvoiceListPage (`/dashboard/finance/invoices`)
- **Purpose:** Invoice list with search, filters, pagination, create/edit/delete.
- **Strengths:** Good filter accessibility; proper aria-labels on icon buttons; role="status" on feedback.
- **Issues:**
  - **Off-palette action buttons:** `#2563EB` edit, `#DC2626` delete, `#000000` hover (InvoiceListPage.tsx:232-234,242-244).
  - **Silent error:** `.catch(() => {})` on reservation code lookup (InvoiceListPage.tsx:129).
  - **No permission checks.**
  - **Complex brittle type:** `Parameters<Parameters<typeof InvoiceForm>[0]['onSubmit']>[0]` (InvoiceListPage.tsx:142).
- **Priority:** P1 (off-palette buttons, no permission checks).
- **Effort:** M
- **Confidence:** Verified — Source

#### InvoiceDetailPage (`/dashboard/finance/invoices/:id`)
- **Purpose:** Invoice detail with print, mark-as-sent/paid/cancel actions.
- **Strengths:** Cleanest page in finance module for token adherence; proper aria-labels; print infrastructure.
- **Issues:**
  - **`navigate(0)` used to refresh** — full page reload instead of client-side state update (InvoiceDetailPage.tsx:87,92,106).
  - **No permission checks.**
  - **No loading state.**
  - **Action buttons have no aria-label** (rely on text content only).
- **Priority:** P2
- **Effort:** S
- **Confidence:** Verified — Source

#### InvoiceFormPage (`/dashboard/finance/invoices/new`, `/:id/edit`)
- **Purpose:** Create/edit invoice.
- **Issues:**
  - **Route bug:** `isEdit = !!id && id !== 'new'` means navigating to `/invoices/new` sets `isEdit = false`, but `!isEdit && id` evaluates to `true` (since `id = 'new'`), triggering a reservation fetch with `id='new'` (InvoiceFormPage.tsx:13,31).
  - **Silent error:** `.catch(() => {})` on reservation fetch (InvoiceFormPage.tsx:48).
  - **Non-token color** `#F2F0EB` (InvoiceFormPage.tsx:93).
  - **No permission checks.**
  - **`defaultValues` recreated every render** — no useMemo (InvoiceFormPage.tsx:55-75).
- **Priority:** P0 (route bug).
- **Effort:** S
- **Confidence:** Verified — Source

#### ReportPage (`/dashboard/finance/reports`)
- **Purpose:** Financial report with period filter, category inclusion/exclusion, stats, charts, export.
- **Strengths:** Good export infrastructure (Excel/PDF/Print); proper aria-labels on export buttons; role="alert" on date range error.
- **Issues:**
  - **Hardcoded date** `new Date('2026-09-15')` (ReportPage.tsx:36).
  - **Non-token semantic colors:** `#2F5D37`, `#7A5A1E`, `#962222`, `#E3EDE4`, `#F0E7D3`, `#F3DEDE` (ReportPage.tsx:271,283,287,291,311,315,319).
  - **FLAT_SERIES duplicated** from SalesPage (ReportPage.tsx:33).
  - **No permission checks.**
  - **`filteredInvoices.slice(0, 5)`** — hardcoded limit, no "show more" (ReportPage.tsx:332).
- **Priority:** P1 (hardcoded dates, non-token colors).
- **Effort:** M
- **Confidence:** Verified — Source

#### ExpensesPage (`/dashboard/finance/expenses`)
- **Purpose:** Expense list with filters, create via modal.
- **Issues:**
  - **No delete functionality** — expenses can only be created.
  - **No feedback message** after creating an expense.
  - **No permission checks.**
  - **No loading state.**
- **Priority:** P2
- **Effort:** S
- **Confidence:** Verified — Source

---

## Section 6 — Shared Component Audit

### 6.1 Components with Inconsistent Visual Behavior

| Component | Issue | Evidence |
|-----------|-------|----------|
| `Button` | All 7 variants render identically (`#232D36`); bronze never used as fill | Button.tsx:43-79 |
| `ErrorState` | Uses raw `<button>` instead of `Button`; no `role="alert"` | ErrorState.tsx:55-71 |
| `Loading` | No `role="status"`/`aria-live`; injects `<style>` tags; no reduced-motion | Loading.tsx:31,46,65 |
| `Card` | `raised` prop accepted but ignored | Card.tsx:14 |
| `Modal` | No focus trap; no `aria-labelledby`; `full` size ignores `maxWidth` | Modal.tsx:39-45,65-78 |
| `Badge` | `blue` variant is identical to `info` | Badge.tsx:16 |

### 6.2 Duplicated Implementations

| Pattern | Files | Lines |
|---------|-------|-------|
| Filter cascade (openFilter, closeFilter, applyFilters, resetFilters, outside-click/Escape useEffect) | ReservationListPage.tsx, ReservationCalendarPage.tsx | ~80 each |
| `statusVariantMap` | ReservationStatusBadge.tsx:4-9, ReservationDetailPage.tsx:17-22, DayReservationsPopup.tsx:22-27 | 3 files |
| `STATUS_BARS` palette | ReservationListPage.tsx:19-25, ReservationCalendarPage.tsx:14-20 | 2 files |
| `ctaStyle`/`handleCtaEnter`/`handleCtaLeave` | AboutPage.tsx:5-33, RoomTypesPage.tsx:5-33, GalleryPage.tsx:5-33, ContactPage.tsx:5-33 | 4 files |
| `FLAT_SERIES` | SalesPage.tsx:26, ReportPage.tsx:33 | 2 files |
| `getDateRange` | SalesPage.tsx:28-59, ReportPage.tsx:35-46 | 2 files |
| `formatCurrency` | SalesPage.tsx:14-16, ReportPage.tsx:21-23 | 2 files |
| Off-palette edit/delete button styles | InvoiceListPage.tsx:232-244, InvoiceDetailPopup.tsx:66-78 | 2 files |
| CheckInButton / CheckOutButton | components/pms/ | Near-identical, differ only in status check and service method |

### 6.3 Reusable Components That Need Improvement

1. **Button** — fix variant styles; add `icon` prop support; ensure all variants are visually distinct.
2. **Modal** — add focus trap, `aria-labelledby`, sticky header, and proper `full` size handling.
3. **Loading** — add `role="status"` + `aria-label`, move keyframes to CSS, add `prefers-reduced-motion` support.
4. **ErrorState** — add `role="alert"`, use shared `Button` component.
5. **Table** — add column alignment options (right-align numerics), sticky header for long lists.
6. **Input/Select** — add `id` prop for explicit label association (currently relies on wrapping `<label>` without `htmlFor`).

### 6.4 Components with Inconsistent Responsive Behavior

- **FloorMapCard** — `aspectRatio: '16 / 9'` with absolute-positioned room areas; no mobile adaptation.
- **CalendarView** — `minWidth: 700px` forces horizontal scroll.
- **RoomSelector** — grid `minmax(160px, 1fr)` may overflow on very small screens.
- **PMSLayout sidebar** — fixed 240px at all breakpoints.

### 6.5 Components with Accessibility Concerns

| Component | Issue |
|-----------|-------|
| `UserForm` | Labels lack `htmlFor`; errors lack `id`/`aria-describedby`; no `aria-invalid` |
| `UserRoleForm` | Same as UserForm |
| `RoleForm` | Same as UserForm; uses raw `<textarea>` |
| `PermissionCheckboxGrid` | 11px fonts; no `fieldset`/`legend` |
| `FloorMapCard` | `role="button"` on `<div>`; floor tabs lack `aria-controls` |
| `CalendarView` | No `role="grid"`; imperative focus handling |
| `RoomSelector` | Imperative focus ring via onFocus/onBlur |
| `DayReservationsPopup` | No focus trap; no `aria-modal`; `invoiceService.getAll()` on every render |
| `RoomOccupancyPopup` | No focus trap; no `aria-modal`; `×` character instead of icon |
| `ActivityFeed` | No aria-labels on feed items or links |
| `StatsCard` | No semantic heading for label |
| `EmptyState` | No `role="status"` |
| `ConfirmDialog` | No `aria-describedby` linking message to dialog |
| `ChangePasswordPage` inputs | Labels not associated; redundant `aria-label` |

### 6.6 Shared Root Causes Affecting Multiple Pages

1. **Permission gating is route-level only.** `RequirePermission` guards routes, but page-level action buttons are not gated. This affects ReservationDetailPage, ReservationListPage, UserListPage, RoleListPage, InvoiceListPage, ExpensesPage, ActivityLogPage, and all finance pages.
2. **Error handling is inconsistent.** Some pages use `role="alert"` (ReservationListPage, UserListPage, RoleListPage), others silently swallow errors (DashboardPage, ReservationDetailPage, InvoiceListPage, PermissionListPage, HomePage).
3. **Loading states are inconsistent.** Some pages use the `Loading` component, others show plain text, and finance pages have no loading state at all (synchronous mock data).
4. **Hardcoded colors instead of CSS vars.** Pervasive across all components.
5. **Hover styles via `onMouseEnter`/`onMouseLeave`** instead of CSS `:hover` — no keyboard equivalent, no reduced-motion support.

---

## Section 7 — Responsive Design Audit

### 7.1 Viewports Actually Tested

**None.** No browser rendering, screenshot capture, or automated viewport testing was performed. All responsive findings are **code-based observations** classified as **Verified — Source** (the CSS/media query exists) or **Unverified Risk** (the behavior at a specific viewport requires runtime testing).

### 7.2 Verified Viewport-Specific Issues (Code-Based)

| Viewport | Issue | Evidence | Classification |
|----------|-------|----------|----------------|
| 375px | Sidebar consumes 64% of viewport (240px fixed) | pms-layout.css:19 | Verified — Source |
| 375px | Calendar requires horizontal scroll (700px min-width) | CalendarView.tsx:238 | Verified — Source |
| 375px | `html` font-size reduced to 13px — affects all rem units | globals.css:228-232 | Verified — Source |
| 430px | Same sidebar and calendar issues | — | Verified — Source |
| 768px | Sidebar still visible (no drawer); `html` font-size 14px | pms-layout.css:19, globals.css:222 | Verified — Source |
| 1024px | Dashboard 12-col grid activates; finance 2-col activates | dashboard-modern.css:504, finance-responsive.css:91 | Verified — Source |
| 1366px+ | No issues observed in code | — | — |

### 7.3 Potential Overflow and Clipping Risks

- **ReservationCalendarPage header** missing `flexWrap: 'wrap'` — title and subtitle will overflow on narrow screens (ReservationCalendarPage.tsx:196).
- **ContactPage sticky button** with `zIndex: 1` may overlap content (ContactPage.tsx:58).
- **RoomListPage table wrapper** `overflow: 'hidden'` may clip dropdowns/focus rings (RoomListPage.tsx:388).
- **Modal `full` size** sets `width: '100vw'` ignoring `maxWidth: '94vw'` (Modal.tsx:44).
- **FloorMapCard** `aspectRatio: '16 / 9'` with absolute-positioned rooms — may clip on narrow screens.

### 7.4 Table and Calendar Usability Concerns

- **Tables** use `tableLayout: fixed` with `overflowX: auto` — acceptable but column widths are not optimized for small screens. Numeric columns are center-aligned instead of right-aligned.
- **Calendar** has no responsive column collapse — it simply scrolls horizontally. A list-view alternative for mobile would be more usable.
- **RoomTypeListPage** is not paginated — all rows render in a single table.

### 7.5 Sidebar and Navigation Concerns

- The sidebar is `position: fixed; width: 240px` at all breakpoints. The only mobile adaptation is a manual rail toggle (60px icon-only mode) that the user must discover themselves.
- There is no hamburger menu, no drawer pattern, and no auto-collapse on small screens.
- The rail mode hides all labels — users must hover to discover navigation items.

### 7.6 Modal and Form Layout Concerns

- Modals use `maxHeight: 85vh` with `overflow: auto` — content scrolls internally without a sticky header.
- On mobile (≤640px), modals become bottom sheets (modal-responsive.css:14) — good pattern.
- The reservation wizard footer stacks to `column-reverse` on mobile (reservation-wizard.css:166) — good.
- Form grids use `auto-fit, minmax(250px, 1fr)` — responsive but may leave awkward gaps.

### 7.7 Print Layout Concerns

- Print CSS uses `@page { size: A4; margin: 14mm }` with `visibility: hidden` on `body *` except the print area — solid approach.
- `print-color-adjust: exact` is set on watermark, table headers, and footer icons — good.
- Invoice table column widths are hardcoded in `style` (InvoicePrintDocument.tsx:146-150) — not responsive for different paper sizes.
- Print document table headers lack `scope="col"` (InvoicePrintDocument.tsx, ReportPrintDocument.tsx).

### 7.8 Viewports That Remain Unverified

All viewports (375px, 430px, 768px, 1024px, 1366px, 1440px+) remain **unverified** at runtime. Code-based observations suggest the most critical issues are at 375px and 430px (sidebar, calendar, font-size reduction).

---

## Section 8 — Accessibility Audit

### 8.1 Verified Accessibility Issues (Source-Code Evidence)

| Issue | WCAG 2.2 Criterion | Evidence | Classification |
|-------|-------------------|----------|----------------|
| Form labels not associated with inputs (no `htmlFor`/`id`) | 1.3.1 Info and Relationships, 3.3.2 Labels or Instructions | UserForm.tsx:186,191,197; UserRoleForm.tsx:149; RoleForm.tsx:101,106,111; ChangePasswordPage.tsx:53-62; DashboardPage.tsx:407,416 | Verified — Source |
| Error messages not linked to inputs (no `aria-describedby`) | 1.3.1, 3.3.1 Error Identification | UserForm.tsx:188,193,199; UserRoleForm.tsx; RoleForm.tsx:103,108 | Verified — Source |
| No `aria-invalid` on inputs with errors | 3.3.1 Error Identification | UserForm.tsx; UserRoleForm.tsx; RoleForm.tsx | Verified — Source |
| `Loading` component has no `role="status"` or `aria-live` | 4.1.3 Status Messages | Loading.tsx:16-68 | Verified — Source |
| `ErrorState` has no `role="alert"` | 4.1.3 Status Messages | ErrorState.tsx:13-75 | Verified — Source |
| `Modal` has no focus trap | 2.4.3 Focus Order | Modal.tsx:47-138 | Verified — Source |
| `Modal` has no `aria-labelledby` | 4.1.2 Name, Role, Value | Modal.tsx:80-120 | Verified — Source |
| Calendar grid lacks `role="grid"` | 1.3.1, 4.1.2 | CalendarView.tsx:238 | Verified — Source |
| `role="button"` on `<div>` elements | 4.1.2 Name, Role, Value | FloorMapCard.tsx:243 | Verified — Source |
| 11px font sizes below readable minimum | 1.4.4 Resize Text (best practice) | PermissionCheckboxGrid.tsx:73,104,114 | Verified — Source |
| No `fieldset`/`legend` for permission groups | 1.3.1 Info and Relationships | PermissionCheckboxGrid.tsx:59-69 | Verified — Source |
| Print table headers lack `scope="col"` | 1.3.1 Info and Relationships | InvoicePrintDocument.tsx:146-150; ReportPrintDocument.tsx | Verified — Source |
| `EmptyState` has no `role="status"` | 4.1.3 Status Messages | EmptyState.tsx:13-50 | Verified — Source |
| `ConfirmDialog` message has no `aria-describedby` | 4.1.2 | ConfirmDialog.tsx:48-56 | Verified — Source |
| `Loading` injects `<style>` tags | — (best practice) | Loading.tsx:31,46,65 | Verified — Source |
| `Loading` has no `prefers-reduced-motion` support | 2.3.3 Animation from Interactions | Loading.tsx:23-30 | Verified — Source |
| Nested interactive elements (`<Link>` > `<button>`) | 4.1.2 | UserListPage.tsx:129 | Verified — Source |
| ✓/✗ characters not accessible | 1.1.1 Non-text Content | PermissionListPage.tsx:43 | Verified — Source |
| Filter mode buttons lack `aria-pressed` | 4.1.2 | DashboardPage.tsx:376-391; ReservationListPage.tsx:421-437 | Verified — Source |
| ManagementPage tabs lack `aria-controls`/`aria-labelledby` | 4.1.2 | ManagementPage.tsx:42-76 | Verified — Source |
| `DayReservationsPopup` has no focus trap or `aria-modal` | 2.4.3, 4.1.2 | DayReservationsPopup.tsx:27-28 | Verified — Source |
| `RoomOccupancyPopup` has no focus trap or `aria-modal` | 2.4.3, 4.1.2 | RoomOccupancyPopup.tsx:27-28 | Verified — Source |

### 8.2 Relevant WCAG 2.2 AA Criteria

The following criteria are most relevant to the identified issues:

- **1.1.1 Non-text Content** — ✓/✗ characters, icon-only buttons
- **1.3.1 Info and Relationships** — label associations, fieldset/legend, table scope, role="grid"
- **1.4.4 Resize Text** — 11px fonts, mobile font-size reduction
- **2.4.3 Focus Order** — modal focus traps
- **2.4.7 Focus Visible** — global `:focus-visible` exists (good); imperative focus handling in CalendarView/RoomSelector is fragile
- **3.3.1 Error Identification** — aria-invalid, aria-describedby, role="alert"
- **3.3.2 Labels or Instructions** — htmlFor/id associations
- **4.1.2 Name, Role, Value** — aria-label, aria-modal, aria-labelledby
- **4.1.3 Status Messages** — role="status", role="alert", aria-live

### 8.3 Automated Test Results

**No automated accessibility testing was performed.** No axe, Lighthouse, or similar tools were available or used. The Playwright suite (45/45 passing per documentation) does not include explicit accessibility assertions.

### 8.4 Manual Verification Requirements

The following require manual testing with assistive technology:

1. **Screen reader testing** — verify that form errors are announced, that modal focus is trapped, that calendar days are readable, and that status badges convey meaning beyond color.
2. **Keyboard-only navigation** — verify that all interactive elements are reachable and operable without a mouse, including the floor map room selector, calendar day cells, and cascading filter panels.
3. **Zoom and text-resizing** — verify that the application remains usable at 200% zoom and when the browser font size is increased.
4. **Contrast verification** — while token colors appear to meet 4.5:1 for body text, this should be verified with a contrast checker, especially for `#6B7881` on `#FFFFFF` (slate on white) and `#C85C5C` on `#FFFFFF`.
5. **Reduced-motion verification** — verify that the application is usable with `prefers-reduced-motion: reduce`.

### 8.5 Recommended Improvements

1. Add `htmlFor`/`id` associations to all form components.
2. Add `aria-invalid` and `aria-describedby` to all inputs with errors.
3. Add `role="status"` + `aria-label` to `Loading`; move keyframes to CSS; add reduced-motion support.
4. Add `role="alert"` to `ErrorState`.
5. Implement a focus trap in `Modal` and all popup dialogs.
6. Add `aria-labelledby` to `Modal` title.
7. Add `role="grid"` to the calendar.
8. Replace `role="button"` on `<div>` with `<button>` elements.
9. Increase 11px fonts to at least 12px.
10. Add `fieldset`/`legend` to permission checkbox groups.
11. Add `scope="col"` to print table headers.
12. Add `role="status"` to `EmptyState`.
13. Add `aria-describedby` to `ConfirmDialog`.

---

## Section 9 — UX and Workflow Audit

### 9.1 Reservation Management

**Workflow:** List → New → Wizard (3 steps: Guest Info → Room Selection → Pricing & Payment) → Detail → Check-in/Check-out/Cancel.

**Strengths:**
- The wizard is well-structured with clear step indicators, per-step validation, and a guarded cancel flow.
- Room selection includes availability checking.
- The pricing panel clearly communicates same/different rate modes, DP terms, and a payment summary.
- The calendar provides a monthly overview with holiday integration.

**Friction Points:**
1. **Ungated actions:** A staff member with only `reservation.view` can attempt check-in, check-out, and cancel — receiving a server 403 error with no prior indication that the action is unauthorized.
2. **Full page reload after actions:** `CheckInButton` and `CheckOutButton` use `navigate(0)` which triggers a full page reload instead of a client-side state update — slow and disorienting.
3. **Silent errors on detail page:** If the API fails, the user sees "Reservation not found" instead of an error message — misleading.
4. **Filter cascade duplication:** The same complex filter logic is implemented twice (list + calendar), increasing maintenance burden and risk of divergence.
5. **No loading state on list page:** Users see "Loading reservations..." text with no spinner or skeleton.

### 9.2 Room Management

**Workflow:** Room List (with floor map) → New/Edit → Form → Save.

**Strengths:**
- The floor map provides a visual, spatial representation of room availability.
- Room selection in the reservation wizard is well-implemented with grouped display and availability indicators.

**Friction Points:**
1. **Off-palette action buttons** — blue edit and red delete buttons break the visual language.
2. **No permission gating** — any user with `room.view` can create/edit/delete rooms.
3. **Silent fetch failures** in edit mode — if the room fetch fails, the form stays empty with no error indication.
4. **RoomTypeListPage not paginated** — inconsistent with RoomListPage.

### 9.3 Invoice Management

**Workflow:** Invoice List → New → Form → Save → Detail → Print/Mark as Sent/Paid/Cancel.

**Strengths:**
- Print infrastructure is well-built with A4 formatting, watermark, and repeating headers.
- The invoice form uses Zod validation with dynamic line items.

**Friction Points:**
1. **Route bug:** Navigating to `/invoices/new` triggers a reservation fetch with `id='new'` — confusing and wasteful.
2. **Silent form submission block:** If invoice status is 'Completed' and payment is not 'Paid', form submission is silently blocked with no user feedback (InvoiceForm.tsx:63-65).
3. **Off-palette action buttons** in list and detail popup.
4. **`navigate(0)` refresh** after mark-as-sent/paid/cancel — full page reload.
5. **No permission gating** — any authenticated user can create/edit/delete invoices.
6. **No delete confirmation feedback** — InvoiceListPage has a `feedback` state but ExpensesPage does not.

### 9.4 Financial Management

**Workflow:** Sales dashboard → Reports → Export (Excel/PDF/Print).

**Strengths:**
- Report page has good export infrastructure and period filtering.
- Category inclusion/exclusion checkboxes are well-implemented.

**Friction Points:**
1. **Hardcoded dates** — `new Date('2026-09-15')` will produce incorrect ranges as time passes.
2. **No loading states** — finance pages render synchronously from mock data with no loading indication.
3. **No permission gating** — all finance data is visible to any authenticated user.
4. **Non-token semantic colors** — green/amber/red used directly instead of CSS vars.
5. **Hardcoded row limit** — `filteredInvoices.slice(0, 5)` with no "show more" option.

### 9.5 User Permissions

**Workflow:** User List → New/Edit → Form → Role Assignment → Permission Management.

**Strengths:**
- The permission model is well-designed: effective permissions = (role grants ∪ user grants) − user denies.
- The permission checkbox grid is grouped and scrollable.
- ManagementPage tabs are permission-filtered.

**Friction Points:**
1. **Ungated "Add User"** — any user can open the create modal.
2. **Hardcoded default password** `'password123'` — security risk.
3. **No validation error for missing role selection** — save button silently does nothing.
4. **Blank modal when user not found** — `UserRoleForm` and `UserPermissionForm` return `null` with no message.
5. **No error states** on several admin pages — failed loads show "not found" instead of errors.

### 9.6 Cross-Workflow Concerns

1. **Inconsistent feedback patterns:** Some pages show toast-like feedback (InvoiceListPage), others show inline alerts, others show nothing.
2. **Inconsistent loading patterns:** Some pages use spinners, others show plain text, others show nothing.
3. **Inconsistent error patterns:** Some pages use `role="alert"`, others silently swallow errors.
4. **Placeholder content:** WhatsApp number, contact info, and several public pages contain placeholder text that should be replaced with real business information.

---

## Section 10 — Prioritized Issue Register

| Issue ID | Priority | Page / Component | Finding | Evidence | User Impact | Recommendation | Effort | Confidence |
|----------|----------|------------------|---------|----------|-------------|----------------|--------|------------|
| SEC-001 | P0 | ReservationDetailPage, CheckInButton, CheckOutButton, UserListPage, RoleListPage, InvoiceListPage, ExpensesPage, ActivityLogPage | Mutation actions (check-in/out, cancel, create, edit, delete) are not gated by permissions — only route-level `*.view` is enforced | ReservationDetailPage.tsx:144,283,296,310,313; CheckInButton.tsx:20; UserListPage.tsx:165; RoleListPage.tsx; InvoiceListPage.tsx:232,242; ExpensesPage.tsx | Users see actions they cannot perform; server 403 errors are confusing; potential for accidental attempts at unauthorized operations | Gate all mutation actions behind their corresponding permissions; show disabled state or hide entirely; display graceful fallback | M | Verified — Source |
| SEC-002 | P0 | UserForm | Hardcoded default password `'password123'` when password field is empty | UserForm.tsx:158 | Security risk — weak default password for new user accounts | Remove the fallback; make password required on create; enforce strong password policy | S | Verified — Source |
| UX-001 | P0 | InvoiceFormPage | Route bug: `/invoices/new` triggers reservation fetch with `id='new'` because `!isEdit && id` evaluates true | InvoiceFormPage.tsx:13,31 | Confusing behavior; unnecessary API call; potential error display | Change condition to `!isEdit && id && id !== 'new'` or restructure route logic | S | Verified — Source |
| UI-001 | P1 | Button | All 7 variants render identically (`#232D36`); bronze brand color never used as button fill | Button.tsx:43-79 | Brand direction (white/brown) is broken; primary actions are indistinguishable from secondary | Fix variant styles: bronze → `#97764D`, danger → token-based red, outline → transparent bg, ghost → no border | S | Verified — Source |
| UI-002 | P1 | InvoiceListPage, InvoiceDetailPopup, RoomListPage, RoomTypeListPage, UserListPage, PMSLayout | Off-palette Tailwind buttons (`#2563EB`, `#DC2626`, `#000000`) bypass the Button component | InvoiceListPage.tsx:232,242; InvoiceDetailPopup.tsx:66,76; RoomListPage.tsx:202,212; RoomTypeListPage.tsx:163,173; UserListPage.tsx:131,140; PMSLayout.tsx:256,292 | Visual inconsistency; breaks white/brown brand; pure black hover states are harsh | Replace all off-palette buttons with the shared `Button` component using appropriate variants | M | Verified — Source |
| UI-003 | P1 | 10+ files | Non-token error color `#C85C5C` used instead of canonical `#962222` | ReservationListPage.tsx:596; UserListPage.tsx:302; RoleListPage.tsx:271; UserForm.tsx:184,188,193,199; UserRoleForm.tsx:131; UserPermissionForm.tsx:151; RoleForm.tsx:99,103,108; ReservationWizardModal.tsx:71-72; ReservationFormPanel.tsx:63; ReservationForm.tsx:189 | Inconsistent error color across the app; may have different contrast ratio than token | Replace all `#C85C5C` with `var(--color-error-text)` (`#962222`) | S | Verified — Source |
| A11Y-001 | P1 | UserForm, UserRoleForm, RoleForm | Form labels not associated with inputs (no `htmlFor`/`id`); no `aria-invalid`/`aria-describedby` | UserForm.tsx:186,191,197; UserRoleForm.tsx:149; RoleForm.tsx:101,106,111 | Screen reader users cannot identify which input a label belongs to; errors are not announced | Add `htmlFor`/`id` associations; add `aria-invalid` and `aria-describedby` | M | Verified — Source |
| A11Y-002 | P1 | Loading | No `role="status"`/`aria-live`; injects `<style>` tags; no reduced-motion support | Loading.tsx:31,46,65 | Screen reader users cannot detect loading state; animations play regardless of user preference | Add `role="status"` + `aria-label`; move keyframes to CSS; add `prefers-reduced-motion` media query | S | Verified — Source |
| A11Y-003 | P1 | ErrorState | No `role="alert"`; uses raw `<button>` instead of shared `Button` | ErrorState.tsx:13-75 | Screen reader users may not announce errors; inconsistent button styling | Add `role="alert"`; replace raw button with `Button` component | S | Verified — Source |
| RWD-001 | P1 | CalendarView | Calendar grid has `minWidth: 700px` with `overflowX: auto` — horizontal scroll on mobile | CalendarView.tsx:238 | Mobile users must scroll horizontally to see the full calendar; poor usability | Implement a responsive list-view alternative for mobile; or reduce min-width and allow column wrapping | M | Verified — Source |
| RWD-002 | P1 | PMSLayout | Sidebar is `position: fixed; width: 240px` at all breakpoints — no mobile drawer | pms-layout.css:19 | Sidebar consumes 64% of a 375px viewport; no hamburger menu or auto-collapse | Implement a mobile drawer pattern with hamburger toggle; auto-collapse below 768px | M | Verified — Source |
| UX-002 | P1 | DashboardPage, ReservationDetailPage, ReservationCalendarPage, InvoiceListPage, InvoiceFormPage, PermissionListPage, HomePage | Silent error swallowing — API failures produce blank screens, "not found", or zero values | DashboardPage.tsx:79-81; ReservationDetailPage.tsx:42-46; ReservationCalendarPage.tsx:129,135; InvoiceListPage.tsx:129; InvoiceFormPage.tsx:48; PermissionListPage.tsx:22-24; HomePage.tsx:46-48 | Users cannot distinguish between "no data" and "failed to load"; no retry option | Add error states with `role="alert"` and retry buttons to all data-fetching pages | M | Verified — Source |
| UX-003 | P1 | ActivityLogPage, SalesPage, ReportPage, ExpensesPage | No loading states — pages appear empty while fetching (synchronous mock data) | ActivityLogPage.tsx; SalesPage.tsx; ReportPage.tsx; ExpensesPage.tsx | Users cannot tell if data is loading or if the page is empty | Add loading indicators (spinner or skeleton) to all data-fetching pages | S | Verified — Source |
| UX-004 | P1 | CheckInButton, CheckOutButton | No try/catch on async actions; `navigate(0)` triggers full page reload | CheckInButton.tsx:20; CheckOutButton.tsx:20 | Unhandled promise rejections; slow full page reload after actions | Add try/catch with error feedback; replace `navigate(0)` with client-side state update | S | Verified — Source |
| UI-004 | P2 | All components | Hardcoded hex colors instead of CSS `var(--color-*)` tokens | Pervasive across all files | Design tokens exist but are not used; color changes require finding every instance | Systematically replace hardcoded hex values with CSS variable references | L | Verified — Source |
| UI-005 | P2 | FloorMapCard, RoomOccupancyPopup, InvoiceFormPage, InvoiceDetailPopup, config/app.ts, utils/statusUtils.ts | Non-token colors: `#E3DED6`, `#F8F6F2`, `#E8E0D4`, `#F2F0EB`, `#F6E1E1` | FloorMapCard.tsx:191,192,262; RoomOccupancyPopup.tsx:70,83,91; InvoiceFormPage.tsx:93; InvoiceDetailPopup.tsx:117; config/app.ts:108; utils/statusUtils.ts:6,12 | Visual inconsistency; colors that are close to but not exactly the token values | Replace with canonical token values | M | Verified — Source |
| UI-006 | P2 | FloorMapCard, RoomListPage | Non-token radii: `6px`, `4px`, `3px`, `999px` | FloorMapCard.tsx:170,193,208,264,333,318,349; RoomListPage.tsx:202,212 | Inconsistent corner rounding across the app | Standardize to token radii (4px, 8px, 12px, 16px) | S | Verified — Source |
| UI-007 | P2 | All pages | Inconsistent max-widths: 1400px, 1200px, 1000px, 900px, 800px | DashboardPage; ReservationListPage.tsx:364; ReservationFormPage.tsx:13; InvoiceDetailPage.tsx:35; RoomFormPage.tsx:10 | No clear content-width strategy; pages feel inconsistent | Define 2-3 standard content widths and apply consistently | S | Verified — Source |
| UI-008 | P2 | PermissionCheckboxGrid | 11px font sizes below readable minimum | PermissionCheckboxGrid.tsx:73,104,114 | Difficult to read, especially on mobile | Increase to at least 12px (caption size) | S | Verified — Source |
| UI-009 | P2 | FloorMapCard | `role="button"` on `<div>` elements | FloorMapCard.tsx:243 | Not semantically correct; may not be keyboard-operable in all browsers | Replace with `<button>` elements | S | Verified — Source |
| A11Y-004 | P2 | Modal | No focus trap; no `aria-labelledby` | Modal.tsx:47-138 | Keyboard users may tab out of the modal; screen readers may not announce the modal title | Implement focus trap; add `aria-labelledby` | M | Verified — Source |
| A11Y-005 | P2 | CalendarView | Calendar grid lacks `role="grid"` | CalendarView.tsx:238 | Screen readers cannot identify the calendar as a grid | Add `role="grid"` with appropriate `aria-rowcount`/`aria-colcount` | S | Verified — Source |
| A11Y-006 | P2 | PermissionCheckboxGrid | No `fieldset`/`legend` for permission groups | PermissionCheckboxGrid.tsx:59-69 | Screen readers cannot identify grouped checkboxes | Add `fieldset`/`legend` for each permission group | S | Verified — Source |
| A11Y-007 | P2 | InvoicePrintDocument, ReportPrintDocument | Print table headers lack `scope="col"` | InvoicePrintDocument.tsx:146-150; ReportPrintDocument.tsx | Screen readers cannot associate headers with data cells in print documents | Add `scope="col"` to all `<th>` elements | S | Verified — Source |
| ARC-001 | P2 | ReservationListPage, ReservationCalendarPage | Filter cascade logic duplicated (~80 lines each) | ReservationListPage.tsx:167-187; ReservationCalendarPage.tsx:75-95 | Maintenance burden; risk of divergence between the two implementations | Extract a shared `useFilterCascade` hook or `FilterPanel` component | M | Verified — Source |
| ARC-002 | P2 | ReservationStatusBadge, ReservationDetailPage, DayReservationsPopup | `statusVariantMap` duplicated in 3 files | ReservationStatusBadge.tsx:4-9; ReservationDetailPage.tsx:17-22; DayReservationsPopup.tsx:22-27 | Maintenance burden; risk of divergence | Import from the canonical `ReservationStatusBadge` component | S | Verified — Source |
| ARC-003 | P2 | AboutPage, RoomTypesPage, GalleryPage, ContactPage | `ctaStyle`/`handleCtaEnter`/`handleCtaLeave` duplicated verbatim | AboutPage.tsx:5-33; RoomTypesPage.tsx:5-33; GalleryPage.tsx:5-33; ContactPage.tsx:5-33 | Maintenance burden; 4 copies to update for any CTA change | Extract a shared `WhatsAppCta` component | S | Verified — Source |
| ARC-004 | P2 | SalesPage, ReportPage | `FLAT_SERIES`, `getDateRange`, `formatCurrency` duplicated | SalesPage.tsx:14-16,26,28-59; ReportPage.tsx:21-23,33,35-46 | Maintenance burden | Extract to shared `utils/finance.ts` and `constants/charts.ts` | S | Verified — Source |
| ARC-005 | P2 | shared/index.ts | Barrel export incomplete — `RoomForm` and `RoomTypeForm` not exported | index.ts | Inconsistency; pages import via direct path | Add missing exports | S | Verified — Source |
| UX-005 | P2 | InvoiceForm | Silent form submission block when Completed+Paid mismatch — no user feedback | InvoiceForm.tsx:63-65 | User clicks Save and nothing happens; no explanation | Show an inline error message explaining the constraint | S | Verified — Source |
| UX-006 | P2 | DashboardPage | Month input labels not associated with inputs | DashboardPage.tsx:407,416 | Screen reader users cannot identify the inputs | Add `htmlFor`/`id` associations | S | Verified — Source |
| RWD-003 | P2 | globals.css | `html` font-size reduced to 14px/13px on mobile — affects all rem units | globals.css:222-232 | Unintended scaling of rem-based components on mobile | Use a more targeted approach (e.g., reduce specific component sizes rather than base font-size) | S | Verified — Source |
| RWD-004 | P2 | ContactPage | Sticky WhatsApp button with `zIndex: 1` may overlap content | ContactPage.tsx:58 | Content may be hidden behind the sticky button on mobile | Increase `zIndex` or add bottom padding to prevent overlap | S | Verified — Source |
| UI-010 | P3 | DashboardPage, FloorMapCard, CalendarView | Magic numbers: `donutR = 54`, `aspectRatio: '16 / 9'`, `minWidth: '700px'`, animation delays | DashboardPage.tsx:258; FloorMapCard.tsx:190; CalendarView.tsx:238 | Not user-facing; maintainability concern | Extract to named constants | S | Verified — Source |
| UI-011 | P3 | ActivityLogPage | `ChevronRight` rotated 180° instead of `ChevronLeft` | ActivityLogPage.tsx:159 | Minor visual inconsistency | Import and use `ChevronLeft` | S | Verified — Source |
| UI-012 | P3 | RoomTypeListPage | Not paginated while RoomListPage is | RoomTypeListPage.tsx:332 | Inconsistent UX between similar list pages | Add pagination to RoomTypeListPage | S | Verified — Source |
| UI-013 | P3 | All public pages | Placeholder WhatsApp number `6200000000000` | HomePage.tsx:21; AboutPage.tsx; ContactPage.tsx | Users cannot contact the business via WhatsApp | Replace with real business phone number | S | Verified — Source |
| UI-014 | P3 | ContactPage | Placeholder contact info (no actual phone, address, hours) | ContactPage.tsx:82,86,90 | Users cannot find contact information | Add real business contact details | S | Verified — Source |
| UX-007 | P3 | UserPermissionForm, UserRoleForm | Return `null` when user not found — blank modal with no message | UserPermissionForm.tsx:128; UserRoleForm.tsx:127 | User sees a blank modal with no explanation | Show a "User not found" message with a close button | S | Verified — Source |
| UX-008 | P3 | ManagementPage | Tabs missing `aria-controls`/`aria-labelledby` | ManagementPage.tsx:42-76 | Screen readers cannot associate tabs with their panels | Add `aria-controls` to tabs and `aria-labelledby` to tabpanels | S | Verified — Source |
| A11Y-008 | P3 | PermissionListPage | ✓/✗ characters not accessible to screen readers | PermissionListPage.tsx:43 | Screen readers may not announce the symbols meaningfully | Use text labels ("Yes"/"No" or "Granted"/"Not granted") with aria-label | S | Verified — Source |
| A11Y-009 | P3 | ChangePasswordPage | Labels not associated with inputs; no h1; non-token colors | ChangePasswordPage.tsx:47-64 | Screen reader users cannot identify inputs; heading hierarchy is broken | Add `htmlFor`/`id`; add h1; use token colors | S | Verified — Source |
| ARC-006 | P3 | CheckInButton, CheckOutButton | Near-identical components differing only in status check and service method | components/pms/ | Maintenance burden | Extract a single `CheckInOutButton` parameterized by transition type | S | Verified — Source |
| ARC-007 | P3 | RoomTypeForm | Create/update payload shape divergence (create adds `images: []`, update doesn't) | RoomTypeForm.tsx:86-96 | Potential API inconsistency; maintenance burden | Unify the payload shape | S | Verified — Source |
| RWD-005 | P3 | ReservationCalendarPage | Header missing `flexWrap: 'wrap'` — will overflow on narrow screens | ReservationCalendarPage.tsx:196 | Title and subtitle overflow on mobile | Add `flexWrap: 'wrap'` and `gap: '12px'` | S | Verified — Source |

**Total: 38 issues** — P0: 3, P1: 11, P2: 16, P3: 8.

---

## Section 11 — Recommended Implementation Roadmap

### Phase 1 — Critical Findings

**Scope:** P0 findings and security-sensitive issues.

| Issue | Description | Effort |
|-------|-------------|--------|
| SEC-001 | Gate all mutation actions behind permissions | M |
| SEC-002 | Remove hardcoded default password | S |
| UX-001 | Fix `/invoices/new` route bug | S |

**Dependencies:** None — these are independent, localized changes.

**Expected benefits:** Eliminates confusing unauthorized-action failures; removes a security risk; fixes a functional bug.

**Risks:** Permission gating requires careful mapping of which permissions gate which actions. The existing permission model (`reservation.create`, `reservation.update`, `user.create`, `role.create`, etc.) should be used. Backend enforcement must be verified to ensure frontend gating does not create a false sense of security.

**Verification:** Test with users having only `*.view` permissions — all mutation buttons should be hidden or disabled. Test with users having appropriate permissions — actions should work normally.

### Phase 2 — Design System Foundation

**Scope:** Shared component consistency and token adoption.

| Issue | Description | Effort |
|-------|-------------|--------|
| UI-001 | Fix Button variant styles | S |
| UI-002 | Replace off-palette buttons with shared Button | M |
| UI-003 | Replace `#C85C5C` with token | S |
| UI-004 | Replace hardcoded hex with CSS vars | L |
| UI-005 | Replace non-token colors | M |
| UI-006 | Standardize radii | S |
| UI-007 | Standardize content widths | S |
| A11Y-001 | Add label associations and aria attributes to forms | M |
| A11Y-002 | Fix Loading accessibility | S |
| A11Y-003 | Fix ErrorState accessibility | S |
| A11Y-004 | Add Modal focus trap and aria-labelledby | M |

**Dependencies:** UI-001 (Button fix) should come first — it unblocks UI-002 (replacing off-palette buttons). UI-004 (token adoption) is a large mechanical change that can proceed in parallel.

**Expected benefits:** Consistent brand appearance across the entire application; improved accessibility for form users; a foundation for all future UI work.

**Risks:** UI-004 is a large change touching many files — must be done carefully to avoid visual regressions. Recommend doing it module-by-module with visual regression checks.

### Phase 3 — High-Impact Pages and Workflows

**Scope:** Pages with the most significant UX problems.

| Issue | Description | Effort |
|-------|-------------|--------|
| UX-002 | Add error states to all data-fetching pages | M |
| UX-003 | Add loading states to finance and activity pages | S |
| UX-004 | Fix CheckIn/CheckOut error handling and refresh | S |
| UX-005 | Fix InvoiceForm silent submission block | S |
| ARC-001 | Extract shared filter cascade hook | M |
| ARC-002 | Deduplicate statusVariantMap | S |
| ARC-003 | Extract shared WhatsAppCta component | S |
| ARC-004 | Extract shared finance utilities | S |

**Dependencies:** Phase 2 (Button fix) should complete before ARC-003 (WhatsAppCta) since the CTA component should use the shared Button.

**Expected benefits:** Users can distinguish between loading, empty, and error states; no more silent failures; reduced maintenance burden from deduplication.

**Risks:** Error states must be designed carefully to avoid overwhelming users with alerts. The filter cascade extraction must preserve the exact behavior of both existing implementations.

### Phase 4 — Responsive Design and Accessibility

**Scope:** Mobile layouts and remaining accessibility improvements.

| Issue | Description | Effort |
|-------|-------------|--------|
| RWD-001 | Implement responsive calendar for mobile | M |
| RWD-002 | Implement mobile sidebar drawer | M |
| RWD-003 | Fix mobile font-size reduction | S |
| RWD-004 | Fix ContactPage sticky button overlap | S |
| RWD-005 | Fix ReservationCalendarPage header overflow | S |
| UI-008 | Increase 11px fonts to 12px | S |
| UI-009 | Replace role="button" on divs with buttons | S |
| A11Y-005 | Add role="grid" to calendar | S |
| A11Y-006 | Add fieldset/legend to permission groups | S |
| A11Y-007 | Add scope="col" to print table headers | S |
| UX-006 | Fix DashboardPage month input labels | S |
| UX-008 | Fix ManagementPage tab aria attributes | S |
| A11Y-008 | Replace ✓/✗ with accessible text | S |
| A11Y-009 | Fix ChangePasswordPage accessibility | S |

**Dependencies:** RWD-001 (calendar) and RWD-002 (sidebar) are the largest items and may require design input. The remaining items are small, localized changes.

**Expected benefits:** Usable mobile experience; WCAG 2.2 AA compliance for the most critical accessibility criteria.

**Risks:** The mobile sidebar drawer and calendar redesign are the highest-risk items — they change core navigation patterns. Recommend user testing before and after.

### Phase 5 — Visual Polish and Regression Testing

**Scope:** Minor inconsistencies and final cleanup.

| Issue | Description | Effort |
|-------|-------------|--------|
| UI-010 | Extract magic numbers to named constants | S |
| UI-011 | Replace rotated ChevronRight with ChevronLeft | S |
| UI-012 | Add pagination to RoomTypeListPage | S |
| UI-013 | Replace placeholder WhatsApp number | S |
| UI-014 | Add real contact information | S |
| UX-007 | Fix blank modal in UserRoleForm/UserPermissionForm | S |
| ARC-006 | Deduplicate CheckIn/CheckOut buttons | S |
| ARC-007 | Unify RoomTypeForm payload shape | S |
| ARC-005 | Complete barrel exports | S |

**Dependencies:** All prior phases should be complete.

**Expected benefits:** Polished, consistent experience; reduced technical debt.

**Risks:** Low — these are minor, localized changes.

**Verification:** Full regression test pass (Playwright 45/45+), visual review at all target viewports, accessibility re-audit.

---

## Section 12 — Acceptance Criteria

The following measurable criteria should be met before the audit findings are considered resolved:

### Design System Consistency

1. The `Button` component renders 7 visually distinct variants: `primary` (ink), `secondary` (ink), `outline` (transparent bg, ink border), `bronze` (`#97764D` bg), `ghost` (no border), `danger` (token-based red), `disabled` (muted).
2. No off-palette colors (`#2563EB`, `#DC2626`, `#000000`, `#C85C5C`, `#E3DED6`, `#F8F6F2`, `#E8E0D4`) remain in the codebase.
3. All hex color values are replaced with `var(--color-*)` CSS variable references.
4. All border radii use token values (4px, 8px, 12px, 16px).
5. Content max-widths follow a consistent standard (e.g., 1200px default, 1400px wide, 800px narrow).

### Permission-Aware UI

6. All mutation actions (check-in, check-out, cancel, create, edit, delete) are hidden or disabled for users lacking the corresponding permission.
7. Users with only `*.view` permissions see no mutation buttons anywhere in the application.
8. Attempting to navigate directly to a restricted route shows a clear, understandable unauthorized state.
9. The unauthorized state is consistent across all restricted routes.

### Forms and Validation

10. All form inputs have programmatically associated labels (`htmlFor`/`id`).
11. All form errors are linked to their inputs via `aria-describedby`.
12. All inputs with errors have `aria-invalid="true"`.
13. No form submission is silently blocked — every validation failure produces a visible, understandable error message.
14. No hardcoded default passwords remain.

### Loading, Empty, and Error States

15. All data-fetching pages show a loading indicator while fetching.
16. All data-fetching pages show an error state with a retry option when the API fails.
17. All list pages show a meaningful empty state when no data is available.
18. The `Loading` component has `role="status"` and an accessible label.
19. The `ErrorState` component has `role="alert"`.

### Responsive Design

20. No unintended horizontal overflow at 375px, 430px, 768px, 1024px, 1366px, and 1440px viewports.
21. The sidebar is accessible via a hamburger menu or drawer on viewports below 768px.
22. The calendar is usable without horizontal scrolling on viewports below 768px.
23. All touch targets are at least 44×44px on mobile viewports.
24. Tables are readable on mobile (horizontal scroll with sticky first column or card-based alternative).

### Accessibility

25. All modals trap focus and are dismissible with Escape.
26. All modals have `aria-labelledby` pointing to their title.
27. The calendar grid has `role="grid"` with appropriate aria attributes.
28. No `role="button"` on non-semantic elements — all interactive elements use `<button>`.
29. All font sizes are at least 12px.
30. All permission checkbox groups use `fieldset`/`legend`.
31. All print table headers have `scope="col"`.
32. Keyboard focus is visible on all interactive elements.
33. The application is usable with `prefers-reduced-motion: reduce`.

### Print and PDF

34. Invoice print layout preserves all required information (invoice number, guest, items, totals, payment status, LUNAS watermark when paid).
35. Report print layout preserves all sections and tables.
36. Print layouts are readable at A4 size with proper margins.

### Functional Preservation

37. All existing business workflows continue to function without modification.
38. No routes, pages, or features are removed.
39. No permissions or role definitions are changed.
40. The Playwright test suite continues to pass (45/45+).

---

## Section 13 — Final Recommendations

### The First Five Issues to Address

1. **UI-001 — Fix the Button component variants.** This is the single highest-leverage change. The `Button` component is used everywhere; fixing its variant styles will immediately repair brand consistency across the entire application. The bronze variant should render `#97764D`, the danger variant should use a token-based red, and outline/ghost should be visually distinct.

2. **SEC-001 — Gate all mutation actions behind permissions.** This is the most important security-adjacent improvement. Users should never see actions they cannot perform. This requires a systematic review of every page with action buttons and the addition of `hasPermission` checks.

3. **UI-002 + UI-003 — Replace off-palette buttons and error colors.** These are visible brand violations that appear on nearly every list page. Replacing them with the shared `Button` component and token-based error colors will dramatically improve visual consistency.

4. **A11Y-001 — Add label associations and aria attributes to forms.** This is the most impactful accessibility improvement. Form users who rely on screen readers currently cannot reliably identify inputs or understand errors.

5. **UX-002 — Add error states to all data-fetching pages.** Silent failures are the most common UX problem in the application. Users cannot distinguish between "no data" and "failed to load," leading to confusion and lost trust.

### Recommended Implementation Order

1. **Phase 1 (Critical):** SEC-001, SEC-002, UX-001 — immediate, independent, high-impact.
2. **Phase 2 (Design System):** UI-001 → UI-002 → UI-003 → A11Y-001 → A11Y-002 → A11Y-003 → UI-004 (token adoption, module by module).
3. **Phase 3 (High-Impact Pages):** UX-002, UX-003, UX-004, UX-005, ARC-001 through ARC-004.
4. **Phase 4 (Responsive + A11y):** RWD-001, RWD-002, then remaining small items.
5. **Phase 5 (Polish):** All remaining P3 items.

### Shared Components with Highest Improvement Leverage

| Component | Leverage | Reason |
|-----------|----------|--------|
| `Button` | Very High | Used on every page; fixing variants repairs brand everywhere |
| `Modal` | High | Used for all dialogs; adding focus trap + aria improves every modal |
| `Input` / `Select` | High | Used in every form; adding id/aria support improves every form |
| `Loading` | Medium | Used in route transitions; adding role="status" improves every page load |
| `ErrorState` | Medium | Used in error paths; adding role="alert" improves every error |
| `Table` | Medium | Used in every list page; adding column alignment improves readability |

### Risks to Avoid During Implementation

1. **Do not change the permission model.** The existing permission names and structure are correct; only the UI gating needs to be added.
2. **Do not change business logic.** Financial calculations, reservation rules, and pricing logic must remain untouched.
3. **Do not remove or rename routes.** All existing routes must continue to work.
4. **Do not introduce a new design system.** The existing token system is well-designed; the problem is adoption, not design.
5. **Do not break the Playwright suite.** All 45 tests must continue to pass.
6. **Do not make changes without visual regression checks.** The token adoption (UI-004) is a large mechanical change that could introduce subtle visual regressions.
7. **Do not assume frontend gating is sufficient for security.** Backend enforcement must be verified separately — hiding a button does not prevent a direct API call.

### Tests Needed Before Considering the Audit Findings Resolved

1. **Playwright regression:** Full suite (45/45+) must pass after each phase.
2. **Permission matrix test:** Verify that each permission combination shows/hides the correct actions.
3. **Keyboard navigation test:** Tab through every page — all interactive elements must be reachable and operable.
4. **Screen reader test:** Verify form labels, error announcements, modal focus, and calendar readability with NVDA or VoiceOver.
5. **Responsive screenshot review:** Capture screenshots at 375px, 430px, 768px, 1024px, 1366px, and 1440px before and after each phase.
6. **Print preview test:** Verify invoice and report print layouts in Chrome, Firefox, and Edge print preview.
7. **Contrast audit:** Run a contrast checker on all text/background combinations.
8. **Reduced-motion test:** Verify usability with `prefers-reduced-motion: reduce`.

---

*End of report.*
