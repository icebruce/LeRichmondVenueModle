# Richmond Studio — Design Guide

**Status:** Source of truth for look and feel · **Version:** 1.0 · **Date:** 2026-10-15
**Mockups:** `docs/mockups/lofi.html` (structure, approved = binding for layout). When a detail is not covered here, match the mockups; when the mockups are silent, apply §1 and flag the new pattern.

The quality bar is the practice of Apple's best product design — clarity, restraint, direct manipulation, immediate feedback, forgiveness — expressed in the warm palette below. It is not a copy of Apple's visual style. §11 turns it into checks.

---

## 1. Principles

1. **The room is the interface.** The 3D viewport dominates. Chrome is quiet, translucent where it overlaps the scene, and recedes when not in use.
2. **Direct manipulation.** Move a table by dragging the table, not by typing coordinates. Numeric fields exist for precision, never as the main path.
3. **Immediate feedback.** Every input answers within 100 ms: a highlight, a ghost, a count that ticks. Anything slower shows progress.
4. **Forgiveness.** Undo everything. Destructive actions do not ask; they act and offer undo.
5. **Progressive disclosure.** Show the three things most people need; the rest is one step away in the inspector.
6. **Honesty.** Estimates look like estimates (the word "approx." and a dotted style), advisories look like advice (amber, never red error language), fidelity labels are always visible on imported items.
7. **One way to do a thing.** No duplicate controls for the same action in the same context.

## 2. Tokens

Defined once in `src/ui/tokens.css` as CSS custom properties. Never hard-code colours, sizes or durations in components.

### 2.1 Colour

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F7F7F4` | App background |
| `--surface` | `#FFFFFF` | Panels, sheets |
| `--surface-glass` | `rgba(255,255,255,0.72)` + `backdrop-filter: blur(20px) saturate(1.4)` | Controls floating over the viewport |
| `--ink` | `#202522` | Primary text |
| `--ink-2` | `#5C605B` | Secondary text |
| `--ink-3` | `#8A8D87` | Tertiary text, placeholders (not for essential text) |
| `--line` | `#E5E5DF` | Hairlines, dividers |
| `--accent` | `#98775B` | Brass: selection, primary emphasis, focus ring |
| `--accent-ink` | `#FFFFFF` | Text on accent |
| `--advisory` | `#B7791F` | Advisory dots, outlines and overlays (amber) |
| `--advisory-ink` | `#8A5A12` | Advisory text (≥ 4.5:1 on white and on the amber tint) |
| `--blocked` | `#C2412D` | Refused move outline only |
| `--ok` | `#3F7D58` | Rare positive confirmation |
| `--thumb-ground` | `#F6F7F5` | Library picture well behind a light-ground thumbnail |
| `--thumb-dark` | `#1D1F1C` | Library picture well behind a lit (dark-ground) thumbnail |

Contrast: all text ≥ 4.5:1 against its background; large text and icons ≥ 3:1.

### 2.2 Type

System UI font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif`) for everything functional. A serif (`"Iowan Old Style", Georgia, serif`) only for the wordmark and scenario titles.

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `--t-title` | 22/28 | 600 | Screen and sheet titles |
| `--t-headline` | 17/22 | 600 | Section headings |
| `--t-body` | 15/20 | 400 | Default |
| `--t-callout` | 14/19 | 400 | Inspector labels, list rows |
| `--t-footnote` | 13/18 | 400 | Hints, metadata |
| `--t-caption` | 12/16 | 500 | Badges, counts captions (minimum size anywhere) |
| `--t-figure` | 28/32 | 500, tabular figures | Big counts |
| `--t-field-phone` | 16/20 | 400 | Text fields on phones, so iOS Safari does not zoom into them when tapped (2026-10-17) |

### 2.3 Space, shape, depth

- Spacing scale (pt): 4, 8, 12, 16, 24, 32, 48. Nothing off-scale.
- Radius: 8 (controls), 12 (cards), 16 (sheets, floating panels), full (pills, swatches).
- Library pictures: wells 84 pt tall (`--thumb-tile`), 64 on phones (`--thumb-tile-sm`); the + badge 28 pt (`--badge`); the "ready" dot on a chip 8 pt (`--dot`); the check or count on a chosen picture 22 pt high (`--check`).
- Elevation: one shadow for floating controls `0 8px 24px rgba(32,37,34,.12)`; sheets add a top hairline. No stacked shadows.

### 2.4 Motion

| Token | Value | Use |
|---|---|---|
| `--m-fast` | 120 ms ease-out | Hover, press, toggles |
| `--m-base` | 220 ms cubic-bezier(.2,.8,.2,1) | Panels, sheets, selection |
| `--m-slow` | 360 ms same curve | Screen changes |
| Camera | spring, settles ≤ 600 ms | All camera moves |

`prefers-reduced-motion`: replace movement with fades; camera cuts with a 150 ms cross-fade.

### 2.5 Icons and targets

One icon set (Lucide, 1.75 px stroke, 20 px in controls). Every interactive target ≥ 44 × 44 pt, including swatches and handles on touch.

## 3. Layout

### 3.1 Desktop (≥ 1024 px)

Owner-approved 2026-10-17 (Option 1 of the navigation mockups, design canvas `Opt1-Rail`).

- **Left rail (76 px):** Room, Add, Style, Guests, Plans. Icon + label; the open section in accent. Clicking the open section folds the panel away; any section brings it back.
- **Panel (left, beside the rail):** 400 px by default, resizable 360–520 px by its edge grip (arrow keys too; remembered on the device), collapsible from its header. A section shows its own page; deeper pages (Room › Layout rules, Room › Paintings, a selection's Details) open inside it with a "‹ Section" back link. Choosing another section always shows that section.
- **Toolbar (one row over the room):** the plan's name, small, with its save state (opens Plans); Dollhouse / Plan / Walk and Reset view centred over the room; Undo, Redo and the light (moon / sun) on the right. Every control 44 pt.
- **Counts:** bottom-right strip; "N checks" opens the checks popover above it, with "Adjust layout rules".
- **Selection:** a floating glass toolbar just above the item (name, seats; Rotate, Duplicate, Sit here, Details, Delete). Details opens the inspector in the panel. Adding a piece selects it and keeps the library open for the next one. Hidden while comparing.
- The camera frames the room in the space right of the panel and below the toolbar; toasts, banners and hints centre in that space. When that space is narrow the cameras show icons only.
- The browser's Back keeps its usual meaning on desktop; in-app layers close with their own controls or Escape.

### 3.2 Phone (< 768 px)

- Full-screen viewport. Bottom tab bar with the same five sections. No plan name on screen (it lives in Plans).
- **Top right:** a stack with the camera (opens a menu of Dollhouse / Plan / Walk), the light and Reset view; Undo / Redo in a second stack under it.
- **Bottom sheet** with three detents (peek 164 pt: one counts line, title and the key actions — owner-approved 2026-10-16; the phone counts line leaves the dance area to Room › Layout rules so it stays on one line; half; full). Swipe down steps it down one detent at a time to closed, a quick flick two. Content pulls the sheet down only from its very top; swiping up on the content raises it only from peek to half, and at half it scrolls: only the grabber opens it full (owner, 2026-10-17).
- **Back:** the system back gesture closes the top layer (checks, a page, the selection, the sheet) and never leaves the app. No pull-to-refresh.
- Adding a piece drops the sheet to its peek with the piece selected; a selection shows its actions first.
- Dragging a table: long-press 300 ms to pick up (haptic where supported), drag, release. Two-finger rotate on a selected item.

### 3.3 Tablet (768–1023 px)

Desktop layout at 768–1023 px too: the panel folds away (its section button or its header) to give the room the full width, and the cameras show icons only.

## 4. Components

| Component | Rules |
|---|---|
| Button | Primary (accent fill), secondary (surface + hairline), plain (text). One primary per view. Pressed state scales to 0.97. |
| Segmented control | 2–4 options, equal widths, sliding selection indicator. |
| Swatch | 32 pt circle in a 44 pt target; selected = 2 pt accent ring with 3 pt offset; name below on hover/long-press. |
| Stepper + figure | For counts (seats, guests): large tabular figure, −/+ buttons, drag on the figure to scrub. |
| Slider | Only for continuous values (dance area size, thresholds); always shows the value and unit. |
| Toast | Bottom-centre of the free room area (above the counts on desktop, above the sheet or the walk pad on phones), clear of every floating control; as wide as its text up to the screen less 16 pt a side. 4 s, one at a time; always carries Undo after a destructive action. |
| Badge | Fidelity labels and "approx." markers: caption size, hairline outline, never colour-only. |
| Grouped list | Rows of 52 pt in a hairline-bordered card: a label (with an optional line under it), its value and a chevron for rows that open a page; toggles sit in the same lists. Owner-approved 2026-10-17. |
| Selection toolbar | Desktop: glass bar over the selected item, kept in the free area, with its name and icon + label actions (Rotate, Duplicate, Sit here, Details, Delete); Delete in `--blocked`. Phone: the actions as 60 pt tiles at the top of the sheet, with Style in place of Details (the sheet is the details). Owner-approved 2026-10-17. |
| Checks popover | Desktop: a card above the counts listing the tightest three checks (Show all), each selecting its items, and "Adjust layout rules ›". Phone: the same list in the sheet. Owner-approved 2026-10-17. |
| Empty state | One sentence, one primary action, no illustration clutter. |
| Dialog | Only for choices with consequences that undo cannot cover (version conflict, `SCN-03`). |
| Category chips | Library families above the item grid (Tables, Event, Florals, Plants, Lights, Signs, Lounge); one selected, remembered for the session. They wrap, so no category is ever hidden. Step 3a, owner-approved 2026-10-16. |
| Library grid | Add: a search field, wrapping category chips ("Yours" carries a dot when a custom model is ready), then pictures two across on desktop and three on phones (name, caption, a + badge). Click or tap adds at the centre of the view; on desktop a picture can be dragged into the room. A search lists table dressing under "For the tables" with Use on tables. "Can't find it?" (dashed row) opens Yours. A dragged picture shows its outline where it will land, or the blocked outline and the reason; a refused drop adds nothing. Step 4D, pending owner approval in its PR. |
| Style | The linen as swatches, then one summary row per part of the dressing (Runner, Candles, Centrepiece, Chairs, Place settings) with its current choice on one line; each opens a page of pictures (three across) with a "‹ Style" back link and, when tables are selected, the Apply to control. Candles: the kinds on each table, each with a − / + count (a plain figure, no scrub: counts run 1–8), above the grid of kinds; tapping a kind adds it (a chosen one shows its count) or removes it; once three are chosen the heading says so and another tap explains. A hint names the tables too small or too full for the whole mix. Place settings: chargers and napkins under Apply to, then its switches under "Every table". "Every table" settings in a grouped list below. Step 4E, pending owner approval in its PR. |
| Seat target | Sit here (`CAM-04`): a 44 pt circle with a chair glyph over each chair of the chosen table, surface fill and accent ring, pressed 0.97. Only while choosing a seat, with a glass bar "Choose a seat · table N" and Cancel. Step 3a, owner-approved 2026-10-16. |
| Crop frame | Inspiration (IMP-03): an accent-outlined frame over the photo with the outside dimmed; drag inside to move, drag a corner (22 pt mark in a 44 pt target) to resize. Step 3b, pending owner approval (PR #4). |
| Seated bar | While seated: a glass bar at the top, "Seated · table N · drag to look around", and Stand up (secondary button). Step 3a, owner-approved 2026-10-16. |

## 5. 3D interaction

- **Hover** (desktop): soft accent outline. **Selection:** solid accent outline + footprint ring on the floor + rotate handle (a small brass circle 0.4 m off the item's edge).
- **Light height** (a selected hanging or ceiling light, step 4F, pending owner approval in its PR): a dashed accent line, with a dark halo, drops from the light to a small ring on the floor, with "≈ 2.6 m" beside it halfway down; in the dollhouse on desktop a brass grip just under the light's lowest point (14 px across, a 44 pt hit area) drags it up or down in 0.1 m steps between its limits, the light following; the selection toolbar hides meanwhile; release saves one undo step, Escape puts it back. Plan shows the line and height only; phones change it with the inspector's − / + stepper.
- **Dragging:** the item lifts 2 cm with a soft shadow; a ghost footprint shows where it lands; snapping guides are thin accent lines.
- **Refused move:** outline turns `--blocked`, a one-line reason appears near the cursor ("Overlaps the bar"), the item springs back on release. Any refused change (move, turn, option, venue furniture) also shows a toast with the reason ("Overlaps the bar. Nothing was changed."), so it is seen wherever the couple is (2026-10-17).
- **Advisory:** amber dashed overlay on the problem area (aisle, doorway), with a short label and a details row in the inspector. Never blocks the action.
- **Dimensions** appear while dragging or resizing, in metres with one decimal, prefixed "≈".

## 6. Keyboard (desktop)

Undo ⌘/Ctrl+Z · Redo ⇧⌘/Ctrl+Z · Delete ⌫/Del · Duplicate ⌘/Ctrl+D · Rotate R (15°), ⇧R (−15°) · Nudge arrows (10 cm), ⇧arrows (1 m) · Cameras 1/2/3 · Walk WASD + mouse · Escape deselects / exits walk. Every control reachable by Tab with a visible accent focus ring.

## 7. States

| State | Treatment |
|---|---|
| First load | Plan outline and counts appear first (< 1.5 s), then the 3D room fades in as it streams; a thin progress line under the top bar. |
| Saving | "Saving…" → "Saved" next to the scenario name; never a modal. |
| Offline | "Offline — changes kept on this device" banner; syncs when back. |
| Conflict | `SCN-03` dialog with the three choices and who changed what. |
| Upload | Thumbnail appears immediately; progress ring on it; errors say what to do ("Image is too large — try a screenshot instead"). |
| Errors | Plain language, what happened + what to do. No codes in the UI. |

## 8. Copy

Short, warm, plain. Sentence case. Numbers as numerals. Dimensions "≈ 2.4 m". Fidelity labels exactly: *Material*, *Approximate 3D*, *Photo preview*, *Exact 3D model*. Advisory messages start with the issue and end with "(advisory)" in details, e.g. "Aisle ≈ 0.8 m — below your 1.0 m setting".

## 9. 3D visual style

**Reference:** owner-supplied DreamHouse3D isometric cutaway samples (not committed; third-party marketing images). What we take from them: high 3/4 isometric framing; far walls full height and near walls cut low with the wall thickness visible as a clean cap; soft contact shadows; clean neutral background; furniture with true proportions and visible detail.

**Adapted to Le Richmond:**
- Tall room (6.5–8 m): in Dollhouse the ceiling is hidden; chandeliers and pendants stay (toggle "Show ceiling" restores it). Wall caps in dark charcoal.
- Default framing from the south-east looking north-west (photo R01 angle), so the back bar wall and the glazed garage doors stand at full height.
- Background: soft warm-grey gradient in daylight; deep charcoal in evening, with the terrace beyond the glass as a dark band with faint warm fairy-light points.
- **Evening (default):** low warm ambient, chandeliers and back-bar shelving glowing (bloom kept subtle), candle pools on tablecloths, warm tone mapping. Mood reference: photo R08.
- **Daylight:** neutral, soft, high-key like the samples; for checking layout.
- Materials: buff and red brick, timber planks and beams, black steel, dark large-format tile with light joints, dark hardwood, white marble bar top, velvet curtains, brass.
- People: matte neutral figures (warm greys), seated and standing poses, no faces.
- Plan view: flat, high-contrast, numbered tables, thin hairlines, no perspective.

## 10. Accessibility

WCAG 2.1 AA contrast; full keyboard operation of all 2D UI; 3D actions all have a 2D equivalent in the inspector (position fields, rotate buttons, delete); labels on every icon button; respects reduced motion and text zoom to 200% in panels.

## 11. Review checklist (used by `ux-reviewer`)

1. Tokens only — no raw colours, sizes, durations.
2. Targets ≥ 44 pt; text ≥ 12 px; contrast meets §2.1.
3. Every action gives feedback within 100 ms; anything slower shows progress.
4. Destructive actions offer undo; no confirmation dialogs except `SCN-03`.
5. Empty, loading, error, offline states designed for the screen.
6. One primary action per view; no duplicate controls.
7. Phone layout checked at 390 × 844; desktop at 1440 × 900 and 1280 × 720.
8. Keyboard path and focus ring for every control.
9. Copy follows §8; fidelity and advisory labels present where required.
10. Motion uses §2.4 tokens and respects reduced motion.
11. Nothing new that is not in the mockups or this guide without a flag.
