# PASTE THIS MESSAGE INTO CLAUDE CODE

I want you to be my autonomous **lead engineer, technical 3D artist, interaction designer, product designer, QA lead and research assistant** for a personal-use, highly realistic, polished, interactive wedding venue configurator. I am the product owner, not a technical implementer. **You do all the work**: inspect references, infer geometry, create 3D scene/assets, build the app, run it, test it, screenshot it, fix defects and iterate. My input should be limited to answering substantive decisions, approving visuals and sharing more references if I choose to.

## Scope, non-negotiable
- Location: **Restaurant Le Richmond, 377 Rue Richmond, Montreal, Quebec**, for my November 2026 wedding.
- **MODEL ONLY THE MAIN RESTAURANT FLOOR. DO NOT MODEL OR CREATE NAVIGABLE AREAS FOR THE MEZZANINE, BISTRO OR TERRACE.** The glass terrace doors and visible staircase/upper architecture may be represented as non-navigable boundaries/backdrops if needed for photographic accuracy. Do not confuse Le Richmond with **Salon Richmond 1861**, a different venue.
- Aim for faithful reconstruction of the *real existing venue*, not a generic wedding loft. Reproduce central bar, distinct flooring zones, raised/sloped main-floor levels and steps, railings, windows, brick, wood ceiling and black steel beams, ceiling fixtures, fixed cabinetry/artwork where visible.
- **I DO NOT HAVE TO SUPPLY A FLOOR PLAN**. Use provided photos, the linked 360° tour and wedding footage to make intelligent assumptions about dimensions and spatial relationships. You own the reconstruction and triangulation. Estimate room bounds and object sizes using architectural scale cues (doors, chairs, humans, bar counter, floor tiles, windows, handrails, fixtures), cross-check multiple angles, assign a confidence to each, and make them easy to revise. Do not claim that assumptions are measured facts.
- The purpose is to test wedding styling **AND** physical layout: add/remove people and tables to see occupancy, change seating/table shapes, reposition dance floor, DJ and food stations, switch linens, candles, centerpieces and lighting; save and compare configurations; inspect isometric, top-down and guest-eye views.
- I want a delightful, fast, minimal, premium interface: **configuring the wedding should feel closer to a game or luxury product configurator than Blender/CAD**.

## Inputs in this handover
Read the entire attached handover folder, especially:
1. `01_PRODUCT_VISION.md`
2. `02_VENUE_RECONSTRUCTION.md`
3. `references/source_manifest.json` and `03_REFERENCE_GUIDE.md`
4. `04_REQUIREMENTS_AND_ACCEPTANCE.md`
5. `05_ASSET_IMPORT.md`
6. `06_TECH_PLAN_AND_QUALITY.md`
7. `examples/EXPERIENCE_MOCKUP.html` (a **conceptual interaction mockup**, not a representation of actual measured venue geometry)
8. Optional: I may later attach an isometric *house* screenshot as camera/UI inspiration only. This is NOT Le Richmond and must never inform the venue geometry.

## Working style / level of autonomy
- First analyze the sources and **show me a compact proposed plan**, technical choices, scope assumptions, reference coverage, risks, estimated phases, and what the first usable demo will show. We will refine that plan in conversation **before major implementation**.
- Propose smart defaults rather than asking me a long questionnaire. Ask me only questions that materially change design direction or require my approval.
- Once I say go, act autonomously within my authorized environment. Implement complete vertical slices; start and inspect the running app, test user flows, capture screenshots, compare each room zone against source images, fix shortcomings and report progress. Don't leave me to manually run complex commands or make 3D objects.
- Avoid a generic shell with placeholder white boxes. Build recognizable geometry/materials in the first meaningful demo; improve fidelity iteratively. Reuse permissively licensed third-party meshes/textures if helpful; catalog provenance.
- Keep user-customizable content data-driven and persistent; architectural shell mostly locked by default with an optional advanced calibration view.
- Build an **Asset Import** experience: paste a URL or drop screenshot/photo, choose what it represents (e.g. centerpiece, chair, floral arrangement, fabric), infer attributes, offer a realistic 3D approximation / textured material / 2D billboard with an explicit fidelity label, let me adjust real-world width/height, then place, scale, rotate and reuse it. Never represent a single photo as a guaranteed accurate 360° mesh.
- For product pages and image links, handle CORS/anti-scraping/copyright limitations gracefully with instructions to upload an image rather than silently failing. Do not download or redistribute third-party source photos into the deployed application without appropriate rights.
- Track uncertainties and inferred dimensions in editable data and a source-of-truth assumptions log. A pretty image cannot masquerade as floor-plan accuracy. Permit collision and aisle warnings using **configurable advisory thresholds**, not claims of venue/fire-code compliance.

## How I want your FIRST RESPONSE to this message
1. Summarize your understanding of what I actually want, the non-negotiable scope and the proposed end-user experience.
2. Identify the strongest references (R01, R02, R03, R04, R08, R09, R10, V03), flag terrace images as exclusions, and state what still needs visual confirmation.
3. Explain how you'll infer initial room dimensions without a floor plan, with uncertainty and adjustable scale.
4. Present a focused architecture and 3-phase build proposal and say what you will produce in the **first 1–2 development sessions**.
5. Critique requirements that might be expensive or impractical, especially photo-to-3D asset import, and propose an effective MVP alternative.
6. Ask me for approval to proceed or make a few key adjustments. **Do not start implementing a large app before we agree on the plan.**

Success: I can open a URL on my computer, instantly recognize Le Richmond main restaurant, drag a table, change linens/candles, add 20 people, see how it feels at eye level, save two scenarios, import a centerpiece reference, and compare how the room looks—without opening a modeling application or editing code.