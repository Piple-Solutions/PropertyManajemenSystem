# agents_rules_mobile.md — PMS Internal (Mobile & Tablet Responsive Fix)

## 1. Project Context
- Application: internal PMS for Homestay Joglo Seruni Syariah. Used by front desk, housekeeping, and managers.
- Frontend root: `E:\Project\Web\pms-internal\frontend`
- Stack (known, do not re-detect): React 18.3 + TypeScript (strict) + Vite 5 + React Router 6 + Tailwind CSS 4 + **14 custom CSS files in `src/styles/`** + **extensive inline styles**. Forms: React Hook Form + Zod. Icons: lucide-react. E2E: Playwright.
- Design tokens: `src/index.css:7-86`, documented in `docs/flat-rework/00-design-tokens.md`. Brand direction: **white / brown (bronze)**, flat design.
- Current problem: mobile view feels **too large** and uncomfortable to use.
- Source of truth for known issues: `frontend-design-audit.md`. **That audit is source-code only. Nothing was rendered or tested at any viewport.** Treat its findings as hypotheses until confirmed with screenshots.

## 2. Task Scope
### IN SCOPE (mobile ≤767px and tablet 768–1023px only)
| ID | Item | Location (per audit) |
|---|---|---|
| RWD-002 | Sidebar is `position: fixed; width: 240px` at all breakpoints (64% of a 375px screen). Needs a mobile **drawer** with hamburger toggle, auto-collapsed below 768px. Reuse the existing 60px rail mode where sensible. | `pms-layout.css:19`, `PMSLayout.tsx` |
| RWD-001 | Calendar has `minWidth: 700px`, forcing horizontal scroll on all phones. Needs a mobile-friendly layout (e.g., day/list view) or a usable scroll with sticky headers. | `CalendarView.tsx:238` |
| RWD-003 | `html` font-size is reduced to 14px/13px on mobile. **Investigate first, see rule 3.2.** | `globals.css:222-232` |
| RWD-004 | Sticky WhatsApp button with `zIndex: 1` may overlap content. | `ContactPage.tsx:58` |
| RWD-005 | Header missing `flexWrap: 'wrap'`. | `ReservationCalendarPage.tsx:196` |
| UI-008 | 11px fonts below readable minimum, raise to ≥12px. | `PermissionCheckboxGrid.tsx:73,104,114` |
| §6.4 / §7.3 | `FloorMapCard` (16/9 aspect + absolute-positioned rooms), `RoomSelector` (`minmax(160px, 1fr)`), `Modal size="full"` (`100vw` ignores `maxWidth: 94vw`), table wrappers with `overflow: hidden` that clip focus rings/dropdowns. | `FloorMapCard.tsx`, `RoomSelector`, `Modal.tsx:44`, `RoomListPage.tsx:388` |
| — | Touch targets ≥44×44px on mobile and tablet; no unintended page-level horizontal overflow at 375, 430, 768, 1024. | global |

### OUT OF SCOPE (do NOT touch, even if you notice them)
Report them in the final report under "Noticed but not changed". Do not fix.

| Group | IDs | Why |
|---|---|---|
| Security / logic / behavior | SEC-001, SEC-002, UX-001, UX-004 | Not presentation. Separate task with its own testing. |
| Design-system / brand colors | UI-001 to UI-007 (Button variants, off-palette buttons, `#C85C5C`, hardcoded hex, non-token colors/radii, max-widths) | Large mechanical change with desktop regression risk. Separate task. |
| Accessibility (non-responsive) | A11Y-001 to A11Y-009 (incl. Modal focus trap), UX-002, UX-003, UX-005 to UX-008 | Forms, ARIA, loading/error states. Separate task. |
| Architecture / content | ARC-001 to ARC-007, UI-010 to UI-014 | Refactors, pagination, placeholder content. Unrelated. |

Exception handling: if a small in-scope change forces you to touch an out-of-scope line (e.g., rewriting `PMSLayout` for the drawer while off-palette buttons exist at `PMSLayout.tsx:256,292`), **keep the existing colors/behavior as-is** and list it in the report.

## 3. Mandatory Rules
1. **No business logic changes.** Do not alter API calls, routing, route paths, permissions, role definitions, state management, financial calculations, reservation rules, or pricing logic. Presentation layer only.
2. **Desktop (≥1280px) must remain visually identical.** All changes must be scoped to mobile/tablet breakpoints (mobile-first or `max-width` media queries / Tailwind responsive prefixes).
3. **Measure before changing.**
   1. Before any code change, capture **baseline screenshots** at 375, 430, 768, 1024, 1366, 1440px using the existing Playwright setup (`playwright.config.ts`) for the key pages (Dashboard, Reservation list, Reservation calendar, Reservation wizard, Rooms, Invoices, Users). Store in a temporary folder, not in the repo's tracked test assets.
   2. For RWD-003, read the **computed** font-size and rem-based sizes on mobile. **Do NOT simply remove the 14px/13px reduction**: because the complaint is "too large", removing it may make everything bigger. Decide from measurements and explain the decision.
4. **Do not introduce a new design system.** Keep the existing tokens and the white/brown palette. Do not recolor, restyle, or rebrand. No new UI library or dependency without explicit approval.
5. **Inline styles cannot use media queries.** For any element that needs responsive behavior, move the relevant styles to a className or an existing CSS file (`pms-layout.css`, `modal-responsive.css`, `reservation-wizard.css`, `finance-responsive.css`, etc.). Prefer extending existing files over creating new ones. Preserve the visual result on desktop exactly.
6. **Do not redo what already works** (per audit §7.6):
   - Modals already become bottom sheets at ≤640px (`modal-responsive.css:14`).
   - Reservation wizard footer already stacks as `column-reverse` on mobile (`reservation-wizard.css:166`).
   - Tables use `tableLayout: fixed` + `overflowX: auto`, which the audit rates acceptable. **Do not convert tables to card lists globally.** Only improve a table if the screenshots show a real problem, preferring a sticky first column.
7. **Playwright suite must keep passing (45/45).** Do not rename or remove elements, `data-testid`s, roles, labels, or text that tests rely on. Run the suite after each phase.
8. **Complete output only.** No placeholders like `// ...rest of code`.
9. Do not edit files outside scope. Do not remove or rename routes, pages, or features.

## 4. Skills to Use
Location: `.agents/skills/<name>`. **Read each `SKILL.md` before using it.** If a skill is not relevant to this web stack, skip it and note that in the report.

### Core (read at the start)
| Skill | Use for |
|---|---|
| `better-layout` | Grid, spacing, containers, breakpoints, shell structure (drawer, calendar) |
| `better-interface` | Density, hierarchy, component patterns |
| `better-typography` | Type scale, line-height, truncation on small screens |
| `better-accessibility` | Touch targets, focus, contrast **for the elements you touch only** |
| `interface-review` | Final review |
| `full-output-enforcement` | Complete code output |

### Supporting (only if relevant)
| Skill | Use for |
|---|---|
| `apple-design` | Touch target / safe-area reference |
| `mobile-native` | Drawer / sheet interaction patterns. **Web-applicable ideas only** |
| `better-ui` | Detail polish on touched components |
| `animate` | Light drawer transition only (150–250ms). Optional |

### Use with caution
`redesign-existing-projects`, `minimalist-ui`, `better-colors`: they can push toward restyling. Use them for **structure and density only**. Never change the palette, tokens, or brand look (rule 3.4).

### Not used
`animate-expo`, `write-swift`, `imagegen-frontend-*`, `brandkit`, `industrial-brutalist-ui`, `gpt-taste`, `stitch-design-taste`, `design-taste-frontend*`, `high-end-visual-design`, `variant`, `prototype`, `break`, `break-ui`, `state-machine`, `pick-ui-library`, `find-animation-opportunities`, `review-animations`, `improve-animations`, `animation-vocabulary`, `explain-interface`, `build-design`, `ask-sonner`, `better-writing`, `emil-design-eng`.

## 5. Breakpoints & Test Viewports
Use the project's existing breakpoints and media queries. Verify at:

| Device | Width |
|---|---|
| Small mobile | 375px |
| Mobile | 430px |
| Tablet portrait | 768px |
| Tablet landscape | 1024px |
| Desktop (must not change) | 1366px, 1440px |

## 6. Mobile & Tablet Standards

### 6.1 Size & Density
- Decide sizes from the **baseline measurements** (rule 3.3), not from assumptions.
- Inputs, selects, textareas: **≥16px font** to prevent iOS Safari auto-zoom.
- Minimum text size anywhere: **12px**.
- Touch targets ≥44×44px (hit area may exceed visual size) with ≥8px spacing.
- Reduce oversized padding/gaps/icons on mobile only where screenshots show waste. Do not use `zoom` or `transform: scale`.
- Avoid `100vh`; use `100dvh`. Respect `env(safe-area-inset-*)` on fixed/sticky bars.

### 6.2 Sidebar → Drawer (RWD-002)
- Below 768px: sidebar hidden by default, opened via a hamburger button in a compact header (≤56px).
- Drawer overlays content with a backdrop; closes on backdrop tap, Escape, and route change.
- Keep all existing nav items, order, labels, and permission-based visibility unchanged.
- Hamburger and drawer items must be real `<button>`/`<a>`, with `aria-label`, `aria-expanded`, `aria-controls`.
- Tablet (768–1023px): rail (60px) or drawer. Choose from screenshots. Content must not be squeezed.
- Content area must use full width on mobile (no left margin reserved for the sidebar).
- Use only a light transition and respect `prefers-reduced-motion`.

### 6.3 Calendar (RWD-001, RWD-005)
- Remove forced `minWidth: 700px` behavior on mobile. Provide a mobile layout (e.g., agenda/day list or compact grid with sticky date header and sticky room column).
- Existing data, filters, popups (`DayReservationsPopup`), and navigation must keep working identically.
- Header must wrap (`flexWrap: 'wrap'`, `gap: 12px`).
- If a new mobile view is added, it must be driven by the same data and handlers. No duplicated business logic.

### 6.4 Other Components
- `FloorMapCard`: make it usable on narrow screens (scrollable container with a sensible min size, or stacked layout). Do not change room data or click behavior.
- `RoomSelector`: no overflow below 375px (e.g., `minmax(min(160px, 100%), 1fr)`).
- `Modal size="full"`: respect `maxWidth`; no horizontal overflow.
- Table wrappers: avoid `overflow: hidden` clipping focus rings/dropdowns.
- Page headers/toolbars/filters: wrap instead of overflow; filters stay accessible, search stays visible.
- Forms: single column on mobile; sticky submit area where it already makes sense.

### 6.5 Tablet (768–1023px)
- Verify both portrait and landscape.
- Grids: 2 columns where space allows. Do not stretch single-column mobile layouts across tablet width.

## 7. Workflow
1. **Baseline**: screenshots per rule 3.3. No code changes yet.
2. **Audit confirmation**: for each in-scope item, confirm or refute with screenshots/computed styles. Identify the **real** causes of "too large". Report findings, including anything that contradicts `frontend-design-audit.md`. **Stop and wait for my confirmation.**
3. **Implement in this order** (run Playwright + re-screenshot after each step):
   1. Layout shell: RWD-002 (drawer, header, content width).
   2. RWD-003 decision (based on measurements).
   3. RWD-001 + RWD-005 (calendar).
   4. Component fixes (§6.4), UI-008, RWD-004.
   5. Tablet pass.
4. **Verify**: all viewports in §5, before/after comparison. Desktop must be pixel-equivalent. Check keyboard access of the new drawer, reduced-motion, no page-level horizontal scroll, no clipped/overlapping elements.
5. **Review**: `interface-review` + `better-accessibility` checklists (only for touched elements).
6. **Report**: changed files and why; skills used; before/after screenshots list; decision notes (especially RWD-003); **"Noticed but not changed"** list with issue IDs; remaining problems.

## 8. Definition of Done
- [ ] Baseline and after screenshots exist for 375 / 430 / 768 / 1024 / 1366 / 1440.
- [ ] No unintended horizontal overflow at 375, 430, 768, 1024.
- [ ] Sidebar is a drawer below 768px; content uses full width on mobile.
- [ ] Calendar is usable on mobile without a forced 700px width.
- [ ] No text below 12px; inputs ≥16px on mobile.
- [ ] Touch targets ≥44px on mobile/tablet for touched components.
- [ ] Desktop unchanged (1366/1440 screenshots match baseline).
- [ ] Playwright suite passes (45/45+). Build, lint, and typecheck pass.
- [ ] No changes to business logic, routes, permissions, or colors/tokens.
- [ ] "Noticed but not changed" list delivered.
