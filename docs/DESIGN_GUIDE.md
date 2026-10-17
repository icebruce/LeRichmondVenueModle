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

### 2.3 Space, shape, depth

- Spacing scale (pt): 4, 8, 12, 16, 24, 32, 48. Nothing off-scale.
- Radius: 8 (controls), 12 (cards), 16 (sheets, floating panels), full (pills, swatches).
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

- **Left rail (72 px):** Venue, Layout, People, Décor, Inspiration, Compare. Icon + label. Active section in accent.
- **Viewport:** fills the rest. Floating glass controls on top: camera switch (Dollhouse / Plan / Walk) top-centre; scenario name + save state top-left; Undo / Redo / Evening–Day top-right; counts strip bottom-left.
- **Inspector (340 px, right):** appears only with a selection or when a rail section needs controls; slides in over the viewport edge (`--m-base`).

### 3.2 Phone (< 768 px)

- Full-screen viewport. Bottom tab bar with the same six sections (icons + short labels).
- **Bottom sheet** replaces the inspector: three detents (peek 164 pt: counts line, title and the key actions; half; full — owner-approved 2026-10-16). Swipe down to dismiss.
- Camera switch as a segmented control at the top; Undo floating bottom-left above the tab bar.
- Dragging a table: long-press 300 ms to pick up (haptic where supported), drag, release. Two-finger rotate on a selected item.

### 3.3 Tablet (768–1023 px)

Desktop layout with the inspector as an overlay sheet from the right.

## 4. Components

| Component | Rules |
|---|---|
| Button | Primary (accent fill), secondary (surface + hairline), plain (text). One primary per view. Pressed state scales to 0.97. |
| Segmented control | 2–4 options, equal widths, sliding selection indicator. |
| Swatch | 32 pt circle in a 44 pt target; selected = 2 pt accent ring with 3 pt offset; name below on hover/long-press. |
| Stepper + figure | For counts (seats, guests): large tabular figure, −/+ buttons, drag on the figure to scrub. |
| Slider | Only for continuous values (dance area size, thresholds); always shows the value and unit. |
| Toast | Bottom-centre, 4 s, one at a time; always carries Undo after a destructive action. |
| Badge | Fidelity labels and "approx." markers: caption size, hairline outline, never colour-only. |
| Empty state | One sentence, one primary action, no illustration clutter. |
| Dialog | Only for choices with consequences that undo cannot cover (version conflict, `SCN-03`). |
| Category chips | Library families above the item grid (Tables, Event, Florals, Plants, Lights, Signs, Lounge); one selected, remembered for the session. They wrap, so no category is ever hidden. Step 3a, owner-approved 2026-10-16. |
| Seat target | Sit here (`CAM-04`): a 44 pt circle with a chair glyph over each chair of the chosen table, surface fill and accent ring, pressed 0.97. Only while choosing a seat, with a glass bar "Choose a seat · table N" and Cancel. Step 3a, owner-approved 2026-10-16. |
| Crop frame | Inspiration (IMP-03): an accent-outlined frame over the photo with the outside dimmed; drag inside to move, drag a corner (22 pt mark in a 44 pt target) to resize. Step 3b, pending owner approval (PR #4). |
| Seated bar | While seated: a glass bar at the top, "Seated · table N · drag to look around", and Stand up (secondary button). Step 3a, owner-approved 2026-10-16. |

## 5. 3D interaction

- **Hover** (desktop): soft accent outline. **Selection:** solid accent outline + footprint ring on the floor + rotate handle (a small brass circle 0.4 m off the item's edge).
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
