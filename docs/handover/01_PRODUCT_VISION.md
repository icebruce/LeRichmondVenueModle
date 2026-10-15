# Product vision — Le Richmond Wedding Studio

## What we are making
A **personal, browser-based, interactive 3D wedding configurator** of Le Richmond's **main restaurant floor only**. It should be visually compelling enough to make decoration decisions and geometrically coherent enough to explore seating density, circulation and visibility. This is *not* a CAD tool, generic floor-planner, automatic image-to-3D reconstruction promise, or fully accurate emergency plan.

## Core jobs to be done
1. See the room **as it is**: architectural shell, bar, floor finishes, major fixed furnishings, railings, windows, chandeliers, warmth and ambience.
2. Plan **what goes where**: tables, chairs, table groupings, dance floor, DJ, food stations, optional décor.
3. Sense **how full it feels**: a realistic human-scale view with 0/25/50/75/100+ guests; configurable seated vs standing proportions. People should not block the UI and should be optimized for frame rate.
4. Compare **styling**: round vs long tables, white vs ivory vs champagne vs black linens, lit vs unlit candles, low vs tall florals, different chair styles, evening lighting and soft event accents.
5. Import **real inspiration**: user pastes product link or drops an image; Claude-assisted intake turns it into an explicit approximation that can be placed. Reference image can remain as a 2D detail/texture until there is a licensed, true 3D model.
6. Save **alternatives**: named layout scenarios, duplicate, revert, side-by-side visual comparisons, snapshots, screenshot export, persistent projects in browser, JSON import/export (and optional cloud later).

## Experience / UX direction
- Product name: **Richmond Studio** (working name).
- Minimal luxury editorial UI: warm white/off-white surfaces, dark charcoal typography, subtle warm brass accents, well-balanced spacing, quiet controls. Avoid thousands of floating tool palettes; one left category rail, large central interactive viewport, contextual right inspector/bottom quick presets.
- Primary cameras: **Dollhouse isometric** (architectural cutaway), **Top Down** (placement and footprints), **Walkthrough** (camera at approx. 1.65m eye height), plus saved camera viewpoints.
- The main actions must be one click or simple drag: add, duplicate, remove, rotate, resize, apply style to one table/all tables, save configuration.
- Do not force CAD concepts on the user. Object snapping, smart placement and optional collision cues; no raw geometry required for normal use.
- Add a **Reference vs Render** comparison so user and Claude can judge reconstruction quality using a real photo alongside an app screenshot from approximately the same angle.

## Scope guards
IN: every indoor ground-floor region of the principal restaurant that is part of the reception, including raised **main-level** dining areas; visible non-navigable staircase, backdrop or mezzanine soffit/guard if it defines the visual scene.
OUT: the mezzanine itself, bistro, terrace, outdoor garden, church ceremony site, streetscapes except optional panorama seen through windows, detailed kitchen/toilets unless visibly relevant to circulation, guest list/RSVP management.

## Planning assumptions
- November 2026 wedding, so test **nighttime/evening** visual states; daylight is useful for checking room structure.
- User expects dance floor and food stations; main-floor usable space is critical. No assumed final guest count or furniture package. Offer sensible editable examples (e.g., 60/75/90 guests) but don't present those as venue-approved capacities.
- Optimize for desktop first (mouse + laptop screen), with responsive read-only/limited-edit tablet view if practical.

## What good looks like — first 5-minute user journey
Open app → room loads in a recognizable angle → load “Dinner / dancing” scenario → change to 75 attendees → add 2 tables and drag them → select all dining tables and swap ivory linens → drop a candle reference photo → place approximation on 3 tables → switch to evening → walk from entrance to dance floor → save “Option B” → compare to “Option A.”

## Project principles
1. Visual fidelity to THIS venue > sheer number of features.
2. Geometry and circulation make sense > pretty but untrustworthy imagery.
3. Useful and delightful MVP > heroic photorealism promises.
4. Photos and other assets have sources and scope tags; never mistake terrace photos for the main room.
5. Claude handles building/testing; user only approves decisions and gives input.