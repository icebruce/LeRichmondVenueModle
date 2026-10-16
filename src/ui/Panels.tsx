import { useMemo, useState, type ReactNode } from "react";
import type { Item } from "../domain/layout/items";
import { shapeOf } from "../domain/layout/items";
import { tableLabels } from "../domain/layout/counts";
import { rectTable, roundTable } from "../domain/library/sizing";
import { spotFor } from "../domain/layout/validate";
import type { LibraryEntry } from "../domain/library/schema";
import type { Scenario } from "../domain/scenario/schema";
import { ROTATE_STEP } from "../state/editor";
import { requestCamera } from "../scene/cameras";
import { useEditor, useStudio } from "../scene/context";
import { Icon } from "./icons";

export type Section = "venue" | "layout";

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  format = (v: number) => String(v),
  onChange,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  testId?: string;
}) {
  const round = (v: number) => Math.round(v * 100) / 100;
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <div className="stepper" data-testid={testId}>
        <button
          type="button"
          aria-label={`Fewer: ${label}`}
          disabled={value <= min}
          onClick={() => onChange(round(Math.max(min, value - step)))}
        >
          <Icon name="minus" size={16} />
        </button>
        <output aria-live="polite" aria-label={label}>
          {format(value)}
        </output>
        <button
          type="button"
          aria-label={`More: ${label}`}
          disabled={value >= max}
          onClick={() => onChange(round(Math.min(max, value + step)))}
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <label className="row toggle">
      <span className="row-label">{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        data-testid={testId}
      />
    </label>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <span className="row-label">{label}</span>
      <div className="seg seg-fill" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={value === o.value ? "on" : ""}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function caption(e: LibraryEntry): string {
  switch (e.id) {
    case "table-rect": {
      const t = rectTable(8, false);
      return `4–14 guests · ≈ ${t.length.toFixed(1)} m for 8`;
    }
    case "table-round":
      return `4–10 guests · ≈ ${roundTable(8).diameter.toFixed(1)} m for 8`;
    case "table-farm":
      return "6–14 guests · bare wood";
    case "table-sweetheart":
      return "2 guests";
    case "table-cocktail":
      return "Standing · ≈ 0.75 m";
    case "dance-floor":
      return "Resizable · wood, white or black";
    case "dj-booth":
      return "≈ 1.8 × 0.8 m · three spots";
    default:
      return "";
  }
}

export function LayoutPanel() {
  const { catalog, editor } = useStudio();
  const guests = useEditor((s) => s.scenarios[s.activeId]?.guests.count ?? 0);
  const snapping = useEditor((s) => s.snapping);
  const placeable = useMemo(
    () => [...catalog.values()].filter((e) => e.placement === "floor" && e.family !== "chair"),
    [catalog],
  );
  return (
    <div className="panel-body" data-testid="layout-panel">
      <h2 className="panel-title">Layout</h2>
      <Stepper
        label="Guests"
        value={guests}
        min={0}
        max={200}
        step={1}
        onChange={(v) => editor.setGuests(v)}
        testId="guests"
      />
      <h3 className="group-title">Add</h3>
      <ul className="library" aria-label="Library">
        {placeable.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className="library-item"
              onClick={() => editor.addItem(e.id, [8, 7])}
              data-testid={`add-${e.id}`}
            >
              <span className="library-icon">
                <img
                  src={`${import.meta.env.BASE_URL}assets/${e.thumbnail}`}
                  alt=""
                  width={44}
                  height={44}
                  loading="lazy"
                />
              </span>
              <span className="library-text">
                <span className="library-name">{e.name}</span>
                <span className="library-caption">{caption(e)}</span>
              </span>
              <Icon name="plus" size={16} className="library-add" />
            </button>
          </li>
        ))}
      </ul>
      <Toggle label="Snap to 10 cm grid" checked={snapping} onChange={(v) => editor.setSnapping(v)} />
      <p className="hint">
        Drag a table to move it. On a phone, press and hold first. Sizes are approximate.
      </p>
    </div>
  );
}

const VIEWS: { key: string; label: string }[] = [
  { key: "R01", label: "From the stair" },
  { key: "R03", label: "At the bar" },
  { key: "R09", label: "Toward the stair" },
  { key: "UV01", label: "From the mezzanine" },
  { key: "UV02", label: "Toward the kitchen" },
];

export function VenuePanel() {
  const { editor, venue } = useStudio();
  const toggles = useEditor((s) => s.scenarios[s.activeId]?.venueToggles);
  return (
    <div className="panel-body" data-testid="venue-panel">
      <h2 className="panel-title">Venue</h2>
      <h3 className="group-title">Views</h3>
      <div className="chips">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            className="chip"
            onClick={() => {
              editor.setCamera("dollhouse");
              requestAnimationFrame(() => requestCamera(v.key));
            }}
          >
            <Icon name="camera" size={16} /> {v.label}
          </button>
        ))}
      </div>
      <h3 className="group-title">Restaurant furniture</h3>
      <Toggle
        label="Communal high table"
        checked={toggles?.communalTable ?? false}
        onChange={(v) => editor.setVenueToggle("communalTable", v)}
        testId="toggle-communal"
      />
      <Toggle
        label="Bar stools"
        checked={toggles?.barStools ?? false}
        onChange={(v) => editor.setVenueToggle("barStools", v)}
        testId="toggle-stools"
      />
      <p className="hint">
        Main restaurant floor only. Room ≈ {venue.width} × {venue.depth} m, estimated from photos; every size
        is approximate.
      </p>
    </div>
  );
}

function itemTitle(item: Item, labels: Map<string, string>, entry: LibraryEntry | undefined): string {
  const label = labels.get(item.id);
  if (label === "♥") return "Sweetheart table";
  if (label && item.libraryId.startsWith("table-")) return `Table ${label}`;
  return entry?.name ?? "Item";
}

export function Inspector() {
  const { editor, catalog, venue } = useStudio();
  const selection = useEditor((s) => s.selection);
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  const refusal = useEditor((s) => s.refusal);
  const labels = useMemo(() => tableLabels(scenario.items, catalog), [scenario.items, catalog]);
  const items = scenario.items.filter((i) => selection.includes(i.id));
  const [labelDraft, setLabelDraft] = useState<string | null>(null);
  if (!items.length) return null;
  const item = items[0] as Item;
  const many = items.length > 1;
  const entry = catalog.get(item.libraryId);
  const shape = shapeOf(item, catalog);
  const locked = !!spotFor(item, venue);
  const ids = items.map((i) => i.id);

  let fields: ReactNode = null;
  if (!many && (shape.kind === "rectTable" || shape.kind === "roundTable") && entry) {
    const seatOpt = entry.options.find((o) => o.key === "seats");
    const endsOpt = entry.options.find((o) => o.key === "ends");
    fields = (
      <>
        {seatOpt?.type === "number" && (
          <Stepper
            label="Seats"
            value={shape.seats}
            min={seatOpt.min}
            max={seatOpt.max}
            step={seatOpt.step}
            onChange={(v) => editor.setOption(item.id, "seats", v)}
            testId="seats"
          />
        )}
        {endsOpt && (
          <Toggle
            label="Chairs at the ends"
            checked={item.options.ends === true}
            onChange={(v) => editor.setOption(item.id, "ends", v)}
            testId="ends"
          />
        )}
        <div className="row">
          <span className="row-label">Size</span>
          <span className="row-value">
            {shape.kind === "rectTable"
              ? `≈ ${shape.length.toFixed(1)} × ${shape.width.toFixed(1)} m`
              : `≈ ${shape.diameter.toFixed(1)} m round`}
          </span>
        </div>
        <label className="row">
          <span className="row-label">Table name</span>
          <input
            className="text-input"
            value={labelDraft ?? labels.get(item.id) ?? ""}
            maxLength={12}
            onChange={(e) => setLabelDraft(e.currentTarget.value)}
            onBlur={() => {
              if (labelDraft !== null) editor.setLabel(item.id, labelDraft);
              setLabelDraft(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            aria-label="Table name"
          />
        </label>
      </>
    );
  } else if (!many && shape.kind === "danceFloor") {
    fields = (
      <>
        <Stepper
          label="Width"
          value={shape.width}
          min={2}
          max={10}
          step={0.3}
          format={(v) => `${v.toFixed(1)} m`}
          onChange={(v) => editor.setOption(item.id, "width", v)}
        />
        <Stepper
          label="Depth"
          value={shape.depth}
          min={2}
          max={8}
          step={0.3}
          format={(v) => `${v.toFixed(1)} m`}
          onChange={(v) => editor.setOption(item.id, "depth", v)}
        />
        <Segmented
          label="Finish"
          value={shape.finish}
          options={[
            { value: "wood", label: "Wood" },
            { value: "white", label: "White" },
            { value: "black", label: "Black" },
          ]}
          onChange={(v) => editor.setOption(item.id, "finish", v)}
        />
        <div className="row">
          <span className="row-label">Area</span>
          <span className="row-value">≈ {Math.round(shape.width * shape.depth)} m²</span>
        </div>
      </>
    );
  } else if (!many && shape.kind === "djBooth") {
    fields = (
      <div className="field">
        <span className="row-label">Position</span>
        <div className="chips" role="radiogroup" aria-label="DJ position">
          {[
            ["free", "Anywhere"],
            ["dj1", "Option 1"],
            ["dj2", "Option 2"],
            ["dj3", "Option 3 · mezzanine"],
          ].map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={(item.options.spot ?? "free") === v}
              className={`chip ${(item.options.spot ?? "free") === v ? "on" : ""}`}
              onClick={() => editor.setOption(item.id, "spot", v as string)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const myRefusal = refusal && ids.includes(refusal.itemId) ? refusal.reason : null;

  return (
    <div className="panel-body" data-testid="inspector">
      <div className="panel-head">
        <h2 className="panel-title">{many ? `${items.length} items` : itemTitle(item, labels, entry)}</h2>
        <button type="button" className="plain-btn" onClick={() => editor.select([])}>
          Done
        </button>
      </div>
      {myRefusal && (
        <p className="refusal" role="alert">
          {myRefusal}. Nothing was moved.
        </p>
      )}
      {fields}
      {!locked && (
        <div className="row actions-row">
          <button
            type="button"
            className="icon-btn"
            aria-label="Rotate left 15°"
            onClick={() => editor.rotateItems(ids, ROTATE_STEP)}
          >
            <Icon name="rotateLeft" />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Rotate right 15°"
            onClick={() => editor.rotateItems(ids, -ROTATE_STEP)}
          >
            <Icon name="rotateRight" />
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => editor.rotateItems(ids, Math.PI / 2)}
            data-testid="rotate-90"
          >
            Turn 90°
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Duplicate"
            title="Duplicate (⌘D)"
            onClick={() => editor.duplicateSelection()}
            data-testid="duplicate"
          >
            <Icon name="copy" />
          </button>
          <button
            type="button"
            className="icon-btn danger"
            aria-label="Delete"
            title="Delete (⌫)"
            onClick={() => editor.deleteSelection()}
            data-testid="delete"
          >
            <Icon name="trash" />
          </button>
        </div>
      )}
      {locked && (
        <div className="row actions-row">
          <p className="hint">
            Fixed at {venue.data.spots[String(item.options.spot)]?.label}. Choose “Anywhere” to move it.
          </p>
          <button
            type="button"
            className="icon-btn danger"
            aria-label="Delete"
            onClick={() => editor.deleteSelection()}
          >
            <Icon name="trash" />
          </button>
        </div>
      )}
      {!many && !locked && (
        <p className="hint">
          Position ≈ {item.x.toFixed(1)} m from the west wall, {item.z.toFixed(1)} m from the back bar wall.
          Arrow keys nudge 10 cm.
        </p>
      )}
    </div>
  );
}
