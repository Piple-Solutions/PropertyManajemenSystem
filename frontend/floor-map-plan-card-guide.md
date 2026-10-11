# Interactive Floor Map Plan Card: Implementation Guide

A guide for building an interactive, cinema-ticketing-style floor map card for **room management**, placed on the existing **Rooms page** next to the room table. It ends with a ready-to-use prompt for **opencode**.

Source material: `Lobby.png` (Floor 1 plan) and `Lobby2.png` (Floor 2 plan).

---

## 1. Goals

- Show a visual floor plan (Floor 1 and Floor 2) where each room is a clickable tile, similar to a seat map in cinema ticketing.
- Color each room tile by its **room category**, using the colors the existing UI already uses for those categories.
- Keep the floor map and the room table **in sync** (selecting in one highlights in the other).
- Support room management actions through the same flows the table already uses.

---

## 2. Page Layout (Rooms Page)

The Rooms page currently has a room table card. Change it to a **two-column split**:

| Column | Content | Width |
|--------|---------|-------|
| Left | **Floor Map Plan card** | Wider |
| Right | **Room Table card** (existing) | Narrower |

Requirements:

- The floor map card must be **clearly wider** than the table card (suggested ratio about **1.6 : 1**, e.g. `grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr)`).
- Gap between the two cards: use the page's existing card-gap spacing.
- In the table card, the **spacing between columns and cell text must be tight** (reduce horizontal cell padding so the table fits the narrower card without horizontal scrolling where possible).
- On small screens (below the tablet breakpoint), stack the cards vertically: floor map on top, table below.
- Both cards should have equal height on desktop where practical, with internal scrolling for the table if needed.

```
+--------------------------------------+  +-----------------------+
|  FLOOR MAP PLAN CARD  (wider)        |  |  ROOM TABLE CARD      |
|  [Floor 1] [Floor 2]     [legend]    |  |  (narrower, tight     |
|                                      |  |   column spacing)     |
|   [19][20]  [Lobby]  [   Joglo   ]   |  |  Room | Category | ...|
|                     [Pool]           |  |  01   | Standard | ...|
|   [01][02][03][04][05][06]  [08][07] |  |  02   | Standard | ...|
|                                      |  |  ...                  |
+--------------------------------------+  +-----------------------+
```

---

## 3. Room Categories and Default Colors

Default tile color is determined by room category.

| Category | Rooms |
|----------|-------|
| Family Room | 04, 05, 06, 17, 20 |
| Standard Room | 01, 02, 03, 07, 08, 13, 14, 15, 16 |
| Twin Room | 09, 10, 11, 12 |
| Homey Room | 19 |
| ECO Room | 18 |

Total: 20 rooms.

**Colors:** do **not** invent new colors. Reuse the exact color tokens or classes the current UI already uses for these categories (for example the category badges or chips in the existing room table). If the table does not color categories yet, derive them from the existing design tokens or theme and expose them as one shared mapping so the table and the map always match.

Non-room areas (not categories, not selectable as rooms):

| Area | Floor | Type | Behavior |
|------|-------|------|----------|
| Lobby | 1 | `info` | Display only, not bookable, not selectable |
| Swimming Pool | 1 | `info` | Display only, not bookable, not selectable |
| Joglo | 1 | `venue` | Not part of the room categories. Rendered as a neutral area. Treat as display-only unless the product owner confirms it is manageable (see Open Questions). |

Info areas use a distinct neutral/brown style (matching the original denah) and a muted look, with no hover or click affordance.

---

## 4. Floor Plan Data

Positions are percentages of the original 1920x1080 canvas (`x`, `y`, `w`, `h`), so the map scales responsively. Render with a container that keeps a **16:9 aspect ratio** and place tiles absolutely using these percentages (or an equivalent SVG `viewBox="0 0 1920 1080"`).

```json
{
  "floors": [
    {
      "id": "floor-1",
      "label": "Floor 1",
      "areas": [
        { "id": "room-19", "label": "19", "kind": "room", "category": "homey",    "x": 3.0,  "y": 5.0,  "w": 8.3,  "h": 15.0 },
        { "id": "room-20", "label": "20", "kind": "room", "category": "family",   "x": 13.2, "y": 5.0,  "w": 8.3,  "h": 15.0 },
        { "id": "lobby",   "label": "Lobby", "kind": "info",  "x": 29.5, "y": 15.1, "w": 10.8, "h": 15.0 },
        { "id": "joglo",   "label": "Joglo", "kind": "venue", "x": 44.8, "y": 14.8, "w": 37.7, "h": 30.6 },
        { "id": "swimming-pool", "label": "Swimming Pool", "kind": "info", "x": 64.4, "y": 47.7, "w": 18.1, "h": 14.9 },
        { "id": "room-01", "label": "01", "kind": "room", "category": "standard", "x": 29.5, "y": 69.9, "w": 7.7, "h": 15.0 },
        { "id": "room-02", "label": "02", "kind": "room", "category": "standard", "x": 38.5, "y": 69.9, "w": 7.7, "h": 15.0 },
        { "id": "room-03", "label": "03", "kind": "room", "category": "standard", "x": 47.6, "y": 69.9, "w": 7.7, "h": 15.0 },
        { "id": "room-04", "label": "04", "kind": "room", "category": "family",   "x": 56.7, "y": 69.9, "w": 7.7, "h": 15.0 },
        { "id": "room-05", "label": "05", "kind": "room", "category": "family",   "x": 65.7, "y": 69.9, "w": 7.7, "h": 15.0 },
        { "id": "room-06", "label": "06", "kind": "room", "category": "family",   "x": 74.8, "y": 70.1, "w": 7.7, "h": 15.0 },
        { "id": "room-08", "label": "08", "kind": "room", "category": "standard", "x": 87.2, "y": 60.5, "w": 8.3, "h": 15.0, "group": "split-level" },
        { "id": "room-07", "label": "07", "kind": "room", "category": "standard", "x": 87.2, "y": 77.5, "w": 8.3, "h": 15.0, "group": "split-level" }
      ],
      "groups": [
        { "id": "split-level", "label": "Split Level", "x": 85.8, "y": 57.6, "w": 11.2, "h": 37.3 }
      ]
    },
    {
      "id": "floor-2",
      "label": "Floor 2",
      "areas": [
        { "id": "room-16", "label": "16", "kind": "room", "category": "standard", "x": 12.2, "y": 12.4, "w": 8.3, "h": 15.0 },
        { "id": "room-18", "label": "18", "kind": "room", "category": "eco",      "x": 25.3, "y": 12.4, "w": 8.3, "h": 15.0 },
        { "id": "room-17", "label": "17", "kind": "room", "category": "family",   "x": 12.2, "y": 30.6, "w": 8.3, "h": 15.0 },
        { "id": "room-15", "label": "15", "kind": "room", "category": "standard", "x": 40.4, "y": 54.9, "w": 8.3, "h": 15.0 },
        { "id": "room-14", "label": "14", "kind": "room", "category": "standard", "x": 50.2, "y": 54.9, "w": 8.3, "h": 15.0 },
        { "id": "room-13", "label": "13", "kind": "room", "category": "standard", "x": 59.8, "y": 54.9, "w": 8.3, "h": 15.0 },
        { "id": "room-12", "label": "12", "kind": "room", "category": "twin",     "x": 69.6, "y": 54.9, "w": 8.3, "h": 15.0 },
        { "id": "room-09", "label": "09", "kind": "room", "category": "twin",     "x": 79.5, "y": 54.9, "w": 8.3, "h": 15.0 },
        { "id": "room-11", "label": "11", "kind": "room", "category": "twin",     "x": 69.6, "y": 72.6, "w": 8.3, "h": 15.0 },
        { "id": "room-10", "label": "10", "kind": "room", "category": "twin",     "x": 79.5, "y": 72.6, "w": 8.3, "h": 15.0 }
      ]
    }
  ]
}
```

Notes:

- `kind: "room"` tiles map to a room record in the existing data (match by room number). Do not duplicate room data; the map only stores geometry and category fallback.
- If the existing room data already has a category field, **that is the source of truth**; the `category` above is the default/seed.
- The Split Level group (Rooms 07 and 08) is drawn as a bordered box with a small "SPLIT LEVEL" label above it.

---

## 5. Interaction Spec

Behave like a cinema seat map:

1. **Floor tabs** at the top of the card: `Floor 1` / `Floor 2`. Switching floors swaps the map. Remember the last selected floor.
2. **Room tiles** show the room number and are colored by category.
3. **Hover:** tile lifts or highlights; a tooltip shows room number, category, and (if available in existing data) status or price.
4. **Click / tap:** selects the room (visible selected state: ring/outline plus stronger fill). Clicking again deselects. Support multi-select only if the existing table already supports multi-select or bulk actions.
5. **Two-way sync with the table:**
   - Selecting a tile highlights and scrolls to the matching table row.
   - Selecting a table row highlights the matching tile (and switches floor if needed).
6. **Legend** below or above the map: one chip per category using the same colors. Clicking a legend chip **filters/dims** other categories (toggle). Include a clear-filter action.
7. **Status overlays:** if the existing room data has statuses (for example occupied, maintenance, unavailable), reflect them on tiles with the existing status styling (dimmed, icon, or badge) without changing the category color base.
8. **Info areas** (Lobby, Pool) and the Joglo venue: not focusable, no hover state, `aria-hidden` or labelled as informational.
9. **Accessibility:** tiles are buttons with `aria-label` ("Room 04, Family Room"), keyboard focusable, Enter/Space to select, visible focus ring, and arrow-key navigation is a nice-to-have. Never rely on color alone: always show the room number, and keep the legend text visible.
10. **Responsive:** map scales with its container; tile text scales down but stays legible; on narrow screens the map remains scrollable or scaled, not clipped.

---

## 6. Technical Guidelines

- Follow the project's existing stack, component conventions, styling system, and file structure. **Do not add new dependencies** unless unavoidable.
- Build small, reusable components, for example: `FloorMapCard`, `FloorTabs`, `FloorMap`, `RoomTile`, `CategoryLegend`.
- Keep one shared source for category to color/label mapping, used by the table, legend, and map.
- Keep floor plan geometry in a separate data module/file (the JSON above), not hard-coded in JSX.
- Selected room state should live in the Rooms page (or a small store) so the table and the map share it.
- Support light/dark themes if the app already does.

---

## 7. Acceptance Criteria

- [ ] Rooms page shows the map card on the left and the table card on the right, with the map card visibly wider.
- [ ] Table card columns have tight horizontal spacing between column edges and text.
- [ ] Layout stacks on small screens.
- [ ] Floor 1 and Floor 2 render matching the original denah arrangement (including the Split Level box).
- [ ] All 20 rooms are colored by the correct category using the app's existing category colors.
- [ ] Lobby, Swimming Pool, and Joglo render as non-interactive areas.
- [ ] Selecting on the map highlights the table row, and vice versa, including cross-floor switching.
- [ ] Legend filter works and can be cleared.
- [ ] Keyboard and screen-reader accessible.
- [ ] No visual or functional regressions in the existing table.

---

## 8. Open Questions

1. Is **Joglo** a manageable/bookable space? It is gray like the rooms in the original image but is not in the category list, so this guide treats it as display-only.
2. Should the map support **multi-select** (bulk actions) or single-select only?
3. Which **statuses** exist in the current room data, and how should they appear on tiles?

---

## 9. Prompt for opencode

Copy everything inside the block below into opencode.

````text
You are working in an existing web project. Your task: build an interactive "Floor Map Plan" card (cinema-seat-map style) for ROOM MANAGEMENT and place it on the existing Rooms page, next to the existing room table.

STEP 0 - EXPLORE FIRST (do not write code yet)
1. Inspect the repo: framework, styling system (Tailwind/CSS modules/etc.), component library, folder conventions, theming (light/dark).
2. Find the Rooms page and the existing room table card. Note how rooms are fetched/stored, which fields exist (room number, category, status, price, etc.), and how selection/row actions work.
3. Find how room CATEGORIES are currently colored in the UI (badges, chips, tokens, CSS variables, Tailwind classes). You MUST reuse these exact colors. Do not invent new hex values. If categories are not colored yet, derive colors from existing design tokens and put them in ONE shared category config used by the table, legend and map.
4. Briefly summarize what you found and your plan, then proceed.

LAYOUT CHANGE (Rooms page)
- Convert the page content to a two-column split:
  - LEFT: new Floor Map Plan card (WIDER).
  - RIGHT: existing Room Table card (NARROWER).
- Use roughly a 1.6 : 1 ratio, e.g. grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr), using the page's existing card gap spacing.
- In the table card, make the spacing between columns and cell text TIGHT (reduce horizontal cell padding) so the table fits the narrower card without horizontal scroll where possible. Do not break existing table features (sorting, filtering, actions, pagination).
- Below the tablet breakpoint, stack vertically: map on top, table below.

ROOM CATEGORIES (default tile color by category)
- Family Room: 04, 05, 06, 17, 20
- Standard Room: 01, 02, 03, 07, 08, 13, 14, 15, 16
- Twin Room: 09, 10, 11, 12
- Homey Room: 19
- ECO Room: 18
If the existing room data already contains a category, that is the source of truth; the list above is the default/seed. Map category names to the existing UI category colors.

NON-ROOM AREAS (Floor 1)
- Lobby and Swimming Pool: informational only, NOT bookable, not selectable. Neutral/brown muted style, no hover/click.
- Joglo: not part of the categories. Render as a neutral display-only area (flag it with a constant so it can be made interactive later).

FLOOR PLAN GEOMETRY
Create a separate data module for geometry. Coordinates are percentages (x, y, w, h) of a 1920x1080 canvas. Render in a container with aspect-ratio 16/9, tiles absolutely positioned by percentage (or an SVG with viewBox="0 0 1920 1080"). Do not hard-code geometry in JSX.

Floor 1:
- room 19 (homey):    x3.0  y5.0  w8.3  h15.0
- room 20 (family):   x13.2 y5.0  w8.3  h15.0
- lobby (info):       x29.5 y15.1 w10.8 h15.0
- joglo (venue):      x44.8 y14.8 w37.7 h30.6
- swimming pool (info): x64.4 y47.7 w18.1 h14.9
- rooms 01..06 in a row, y69.9 (room 06 y70.1), w7.7 h15.0, x = 29.5, 38.5, 47.6, 56.7, 65.7, 74.8
  (01-03 standard, 04-06 family)
- Split Level group (bordered box with small "SPLIT LEVEL" label): x85.8 y57.6 w11.2 h37.3
  - room 08 (standard): x87.2 y60.5 w8.3 h15.0 (top)
  - room 07 (standard): x87.2 y77.5 w8.3 h15.0 (below 08)

Floor 2:
- room 16 (standard): x12.2 y12.4 w8.3 h15.0
- room 18 (eco):      x25.3 y12.4 w8.3 h15.0
- room 17 (family):   x12.2 y30.6 w8.3 h15.0 (below 16)
- row y54.9, w8.3 h15.0: room 15 (standard) x40.4, room 14 (standard) x50.2, room 13 (standard) x59.8, room 12 (twin) x69.6, room 09 (twin) x79.5
- row y72.6, w8.3 h15.0: room 11 (twin) x69.6 (below 12), room 10 (twin) x79.5 (below 09)

Tile label = room number (e.g. "04"). Match each room tile to the existing room record by room number; do not duplicate room data.

INTERACTION (cinema-ticketing feel)
1. Floor tabs at the top: Floor 1 / Floor 2. Persist last selected floor.
2. Tiles colored by category. Hover: subtle lift/highlight plus tooltip (room number, category, and status/price if available in existing data).
3. Click/tap selects a room (clear selected state: ring + stronger fill); click again deselects. Only enable multi-select if the table already supports multi-select/bulk actions.
4. Two-way sync with the table: selecting a tile highlights + scrolls to the matching table row; selecting a table row highlights the tile and switches floor if needed. Keep selected state in the Rooms page (or the existing store) shared by both.
5. Category legend (chips with the same colors). Clicking a chip toggles filtering/dimming of other categories; provide a clear-filter control.
6. If rooms have statuses (occupied, maintenance, etc.), reflect them on tiles using existing status styling without losing the category color.
7. Accessibility: tiles are <button>s with aria-label like "Room 04, Family Room", keyboard focusable, Enter/Space to select, visible focus ring. Never rely on color alone (always show room number; legend has text). Info areas are not focusable.
8. Responsive: map scales with container; text stays legible; no clipping.

CODE GUIDELINES
- Follow existing stack, conventions, naming and file structure. Add NO new dependencies unless absolutely necessary (and justify it if so).
- Suggested components: FloorMapCard, FloorTabs, FloorMap, RoomTile, CategoryLegend. Keep a single shared category->color/label mapping used by table, legend and map.
- Support light/dark themes if the app does.
- Do not regress existing table behavior.

DELIVERABLES
- Implementation of the above.
- Short summary of files created/changed, any assumptions (especially around Joglo, statuses, multi-select), and how to run/verify.
- Run the linter/type-check/tests that exist in the project and fix issues you introduced.

ACCEPTANCE CHECKLIST
- Map card left and visibly wider than table card on desktop; stacked on mobile.
- Table columns have tight spacing.
- Floor 1 and Floor 2 match the described arrangement, including the Split Level box.
- All 20 rooms use the correct category colors from the existing UI.
- Lobby, Swimming Pool, Joglo are non-interactive.
- Map <-> table selection sync works, including cross-floor.
- Legend filter works and is clearable.
- Keyboard and screen-reader accessible.
````
