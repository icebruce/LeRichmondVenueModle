import { useMemo, useState } from "react";
import { type Item, type Shape, isTable, shapeOf } from "../domain/layout/items";
import { FLORAL_PALETTES } from "../domain/layout/decor";
import { styleOf } from "../domain/scenario/scenario";
import { countLayout, tableLabels } from "../domain/layout/counts";
import { itemTitle, spotFor } from "../domain/layout/validate";
import type { Catalog } from "../domain/library/catalog";
import type { ItemOption, LibraryEntry } from "../domain/library/schema";
import type { Scenario, TableStyle } from "../domain/scenario/schema";
import { ROTATE_STEP } from "../state/editor";
import { requestCamera, viewStore } from "../state/view";
import { useEditor, useStudio, useView } from "../scene/context";
import { Icon } from "./icons";

export type Section = "venue" | "layout" | "people" | "decor";

const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

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

const metres = (v: number) => `${v.toFixed(1)} m`;

/** One line under a library item, worked out from its data (LIB-12): guests and size. */
function caption(e: LibraryEntry, catalog: Catalog): string {
  let shape: Shape;
  try {
    shape = shapeOf({ id: "", libraryId: e.id, x: 0, z: 0, rotY: 0, options: {} }, catalog);
  } catch {
    return "";
  }
  const seatOpt = e.options.find((o) => o.key === "seats");
  const guests =
    seatOpt?.type === "number"
      ? `${seatOpt.min}–${seatOpt.max} guests`
      : "seats" in shape
        ? `${shape.seats} guests`
        : "";
  const n = seatOpt?.default;
  const size =
    shape.kind === "rectTable"
      ? shape.farm
        ? "bare wood"
        : `≈ ${metres(shape.length)}${n ? ` for ${n}` : ""}`
      : shape.kind === "roundTable"
        ? `≈ ${metres(shape.diameter)} for ${n}`
        : shape.kind === "cocktail"
          ? `Standing · ≈ ${metres(shape.diameter)}`
          : shape.kind === "danceFloor"
            ? `Resizable · ≈ ${shape.width} × ${shape.depth} m`
            : `≈ ${shape.width} × ${shape.depth} m`;
  return [guests, size].filter(Boolean).join(" · ");
}

function Thumb({ entry }: { entry: LibraryEntry }) {
  return (
    <span className="library-icon">
      <img
        src={`${import.meta.env.BASE_URL}assets/${entry.thumbnail}`}
        alt=""
        width={44}
        height={44}
        loading="lazy"
      />
    </span>
  );
}

export function LayoutPanel() {
  const { catalog, editor } = useStudio();
  const snapping = useEditor((s) => s.snapping);
  const placeable = useMemo(
    () => [...catalog.values()].filter((e) => e.placement === "floor" && e.family !== "chair"),
    [catalog],
  );
  return (
    <div className="panel-body" data-testid="layout-panel">
      <h2 className="panel-title">Add to the room</h2>
      <ul className="library" aria-label="Library">
        {placeable.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className="library-item"
              onClick={() => editor.addItem(e.id, viewStore.getState().focus)}
              data-testid={`add-${e.id}`}
            >
              <Thumb entry={e} />
              <span className="library-text">
                <span className="library-name">{e.name}</span>
                <span className="library-caption">{caption(e, catalog)}</span>
              </span>
              <Icon name="plus" size={16} className="library-add" />
            </button>
          </li>
        ))}
      </ul>
      <Toggle label="Snap to 10 cm grid" checked={snapping} onChange={(v) => editor.setSnapping(v)} />
      <p className="hint">
        {touch ? "Press and hold a table, then drag it." : "Drag a table to move it."} Sizes are approximate.
      </p>
    </div>
  );
}

function Swatches({
  label,
  options,
  value,
  onPick,
  testId,
}: {
  label: string;
  options: { id: string; name: string; colour: string }[];
  value: string;
  onPick: (id: string) => void;
  testId: string;
}) {
  const current = options.find((o) => o.id === value);
  return (
    <div className="field">
      <span className="row-label">
        {label} <span className="row-value">{current?.name}</span>
      </span>
      <div className="swatches" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            aria-label={o.name}
            title={o.name}
            className={`swatch ${value === o.id ? "on" : ""}`}
            onClick={() => onPick(o.id)}
            data-testid={`${testId}-${o.id}`}
          >
            <span style={{ background: o.colour }} />
          </button>
        ))}
      </div>
    </div>
  );
}

function Chips({
  label,
  options,
  value,
  onPick,
  testId,
}: {
  label: string;
  options: { id: string; name: string }[];
  value: string;
  onPick: (id: string) => void;
  testId: string;
}) {
  return (
    <div className="field">
      <span className="row-label">{label}</span>
      <div className="chips" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            className={`chip ${value === o.id ? "on" : ""}`}
            onClick={() => onPick(o.id)}
            data-testid={`${testId}-${o.id}`}
          >
            {o.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Décor (DEC-01..05): linens, candles, florals, chairs and place settings, applied to all tables or
 * to the selected ones. Placements never move.
 */
export function DecorPanel() {
  const { editor, catalog } = useStudio();
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  const selection = useEditor((s) => s.selection);
  const tables = scenario.items.filter((i) => selection.includes(i.id) && isTable(i, catalog));
  const [scope, setScope] = useState<"all" | "selected">(tables.length ? "selected" : "all");
  const target = scope === "selected" && tables.length ? tables.map((t) => t.id) : "all";
  const shown = target !== "all" && tables[0] ? styleOf(tables[0], scenario.style) : scenario.style;
  const apply = (patch: Partial<TableStyle>) => editor.applyStyle(target, patch);
  const family = (f: string) => [...catalog.values()].filter((e) => e.family === f);
  const colourOf = (id: string) => {
    const model = catalog.get(id)?.model;
    return model?.kind === "parametric" ? String(model.params.colour ?? "#ccc") : "#ccc";
  };
  const none = { id: "none", name: "None" };
  return (
    <div className="panel-body" data-testid="decor-panel">
      <h2 className="panel-title">Décor</h2>
      {tables.length > 0 ? (
        <Segmented
          label="Apply to"
          value={scope}
          options={[
            { value: "selected", label: tables.length === 1 ? "This table" : `${tables.length} tables` },
            { value: "all", label: "All tables" },
          ]}
          onChange={setScope}
        />
      ) : (
        <p className="hint">Applies to all tables. Select tables first to dress just those.</p>
      )}
      <Swatches
        label="Linen"
        options={family("linen").map((e) => ({
          id: e.id,
          name: e.name.replace(" tablecloth", ""),
          colour: colourOf(e.id),
        }))}
        value={shown.linen}
        onPick={(id) => apply({ linen: id })}
        testId="linen"
      />
      <div className="seg seg-fill" role="radiogroup" aria-label="Tablecloth length">
        {(
          [
            ["floor", "To the floor"],
            ["lap", "Lap length"],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={scenario.style.linenLength === v}
            className={scenario.style.linenLength === v ? "on" : ""}
            onClick={() => editor.setStyle("linenLength", v)}
            data-testid={`linen-length-${v}`}
          >
            {l}
          </button>
        ))}
      </div>
      <Chips
        label="Candles"
        options={[none, ...family("candle").map((e) => ({ id: e.id, name: e.name }))]}
        value={shown.candles}
        onPick={(id) => apply({ candles: id })}
        testId="candles"
      />
      <Chips
        label="Florals"
        options={[none, ...family("floral").map((e) => ({ id: e.id, name: e.name }))]}
        value={shown.florals}
        onPick={(id) => apply({ florals: id })}
        testId="florals"
      />
      {shown.florals !== "none" && (
        <Swatches
          label="Flower colours"
          options={Object.entries(FLORAL_PALETTES).map(([id, p]) => ({
            id,
            name: p.label,
            colour: `linear-gradient(135deg, ${p.colours.join(", ")})`,
          }))}
          value={shown.floralColour}
          onPick={(id) => apply({ floralColour: id })}
          testId="floral-colour"
        />
      )}
      <Chips
        label="Chairs"
        options={family("chair").map((e) => ({ id: e.id, name: e.name.replace(" chair", "") }))}
        value={shown.chair}
        onPick={(id) => apply({ chair: id })}
        testId="chair"
      />
      <Toggle
        label="Place settings"
        checked={scenario.style.settings}
        onChange={(v) => editor.setStyle("settings", v)}
        testId="settings"
      />
      {scenario.style.settings && (
        <Chips
          label="Chargers"
          options={[
            { id: "gold", name: "Gold" },
            { id: "silver", name: "Silver" },
            { id: "glass", name: "Glass" },
            none,
          ]}
          value={shown.charger}
          onPick={(id) => apply({ charger: id })}
          testId="charger"
        />
      )}
      {tables.length === 1 && tables[0]?.style && (
        <button
          type="button"
          className="btn"
          onClick={() => tables[0] && editor.applyStyle("all", styleOf(tables[0], scenario.style))}
          data-testid="style-to-all"
        >
          Apply this table’s style to all
        </button>
      )}
      <p className="hint">Placements never move. Sizes and colours are approximate.</p>
    </div>
  );
}

/** People (PPL-01..02, SCN-07): one control, guest count; seated vs standing follows the seats. */
export function PeoplePanel() {
  const { editor, catalog } = useStudio();
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  const show = useView((s) => s.showPeople);
  const c = useMemo(
    () => countLayout(scenario.items, scenario.guests.count, catalog),
    [scenario.items, scenario.guests.count, catalog],
  );
  const seated = Math.min(c.seats, c.guests);
  const tablesNeeded = Math.ceil(c.withoutSeat / 8);
  return (
    <div className="panel-body" data-testid="people-panel">
      <h2 className="panel-title">Guests</h2>
      <Stepper
        label="Guest count"
        value={scenario.guests.count}
        min={0}
        max={200}
        onChange={(v) => editor.setGuests(v)}
        testId="guests"
      />
      <div className="figures" aria-label="Seating">
        <div className="figure">
          <b data-testid="people-seated">{seated}</b>
          <span>seated</span>
        </div>
        <div className="figure">
          <b data-testid="people-standing">{c.withoutSeat}</b>
          <span>standing</span>
        </div>
        <div className="figure">
          <b>{Math.max(0, c.seats - c.guests)}</b>
          <span>seats left</span>
        </div>
      </div>
      {c.withoutSeat > 0 && (
        <p className="advice" role="note">
          {c.withoutSeat} {c.withoutSeat === 1 ? "guest" : "guests"} without a seat. Add {tablesNeeded}{" "}
          {tablesNeeded === 1 ? "table" : "tables"} of 8, or raise seats on existing tables.
        </p>
      )}
      <Segmented
        label="Moment"
        value={scenario.phase ?? "dinner"}
        options={[
          { value: "dinner", label: "Dinner" },
          { value: "party", label: "Party" },
        ]}
        onChange={(v) => editor.setPhase(v)}
      />
      <div className="row">
        <button type="button" className="btn" onClick={() => editor.shuffleGuests()} data-testid="shuffle">
          Shuffle guests
        </button>
      </div>
      <Toggle label="Show people" checked={show} onChange={(v) => viewStore.setState({ showPeople: v })} />
      <p className="hint">
        People are simple neutral figures. Seated first; the rest stand near the bar, never on the dance floor
        at dinner. At the party the dance floor fills.
      </p>
    </div>
  );
}

const VIEWS: { key: string; label: string; detail: string }[] = [
  { key: "R01", label: "From the stair", detail: "Looking over the bar to the glass doors" },
  { key: "R03", label: "At the bar", detail: "Chandelier, back bar and paintings" },
  { key: "R09", label: "Toward the stair", detail: "Street windows and the mezzanine" },
  { key: "UV01", label: "From the mezzanine", detail: "The whole room from above" },
  { key: "UV02", label: "Toward the kitchen", detail: "Dance floor side and the stair" },
];

export function VenuePanel() {
  const { editor, venue } = useStudio();
  const toggles = useEditor((s) => s.scenarios[s.activeId]?.venueToggles);
  return (
    <div className="panel-body" data-testid="venue-panel">
      <h2 className="panel-title">Venue</h2>
      <h3 className="group-title">Views</h3>
      <ul className="library" aria-label="Views">
        {VIEWS.map((v) => (
          <li key={v.key}>
            <button
              type="button"
              className="library-item"
              onClick={() => {
                editor.setCamera("dollhouse");
                requestAnimationFrame(() => requestCamera(v.key));
              }}
            >
              <span className="library-icon">
                <Icon name="camera" />
              </span>
              <span className="library-text">
                <span className="library-name">{v.label}</span>
                <span className="library-caption">{v.detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
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

/** Inspector control for one library option (LIB-12: options come from the catalogue entry). */
function OptionField({
  option,
  item,
  value,
}: {
  option: ItemOption;
  item: Item;
  value: number | string | boolean;
}) {
  const { editor } = useStudio();
  const set = (v: number | string | boolean) => editor.setOption(item.id, option.key, v);
  if (option.type === "number") {
    const unit = option.unit;
    return (
      <Stepper
        label={option.label}
        value={Number(value)}
        min={option.min}
        max={option.max}
        step={option.step}
        format={unit === "m" ? metres : unit ? (v) => `${v} ${unit}` : undefined}
        onChange={set}
        testId={option.key}
      />
    );
  }
  if (option.type === "boolean") {
    return <Toggle label={option.label} checked={value === true} onChange={set} testId={option.key} />;
  }
  if (option.choices.length <= 3) {
    return <Segmented label={option.label} value={String(value)} options={option.choices} onChange={set} />;
  }
  return (
    <div className="field">
      <span className="row-label">{option.label}</span>
      <div className="chips" role="radiogroup" aria-label={option.label}>
        {option.choices.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={value === c.value}
            className={`chip ${value === c.value ? "on" : ""}`}
            onClick={() => set(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** What the options add up to, in metres (approximate). */
function sizeOf(shape: Shape): string | null {
  switch (shape.kind) {
    case "rectTable":
      return `≈ ${shape.length.toFixed(1)} × ${shape.width.toFixed(1)} m`;
    case "roundTable":
      return `≈ ${shape.diameter.toFixed(1)} m round`;
    case "danceFloor":
      return `≈ ${Math.round(shape.width * shape.depth)} m²`;
    default:
      return null;
  }
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

  const size = sizeOf(shape);
  const fields = !many && entry && (
    <>
      {entry.options.map((o) => (
        <OptionField key={o.key} option={o} item={item} value={item.options[o.key] ?? o.default} />
      ))}
      {size && (
        <div className="row">
          <span className="row-label">{shape.kind === "danceFloor" ? "Area" : "Size"}</span>
          <span className="row-value">{size}</span>
        </div>
      )}
      {entry.seats && labels.has(item.id) && labels.get(item.id) !== "♥" && (
        <label className="row">
          <span className="row-label">Table number</span>
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
            aria-label="Table number"
          />
        </label>
      )}
    </>
  );

  const myRefusal = refusal && ids.includes(refusal.itemId) ? refusal.reason : null;

  // Key actions sit right under the title so the phone sheet's peek height shows them (DESIGN_GUIDE §3.2).
  return (
    <div className="panel-body" data-testid="inspector">
      <div className="panel-head">
        <h2 className="panel-title">{many ? `${items.length} items` : itemTitle(item, labels, catalog)}</h2>
        <button type="button" className="plain-btn" onClick={() => editor.select([])}>
          Done
        </button>
      </div>
      <div className="actions-row" role="group" aria-label="Actions">
        {!locked && (
          <>
            <span className="rotate-group" role="group" aria-label="Rotate (clockwise is +)">
              <button type="button" className="btn" onClick={() => editor.rotateItems(ids, ROTATE_STEP)}>
                −15°
              </button>
              <button type="button" className="btn" onClick={() => editor.rotateItems(ids, -ROTATE_STEP)}>
                +15°
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => editor.rotateItems(ids, -Math.PI / 2)}
                data-testid="rotate-90"
              >
                90°
              </button>
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => editor.duplicateSelection()}
              title="Duplicate (⌘D)"
              data-testid="duplicate"
            >
              Duplicate
            </button>
          </>
        )}
        <button
          type="button"
          className="btn icon-only"
          onClick={() => editor.deleteSelection()}
          title="Delete (⌫)"
          aria-label="Delete"
          data-testid="delete"
        >
          <Icon name="trash" size={18} />
        </button>
      </div>
      {myRefusal && (
        <p className="refusal" role="alert">
          {myRefusal}. Nothing was moved.
        </p>
      )}
      {fields}
      {locked && (
        <p className="hint">
          Fixed at {venue.data.spots[String(item.options.spot)]?.label}. Choose “Anywhere” to move it.
        </p>
      )}
      {!many && !locked && (
        <p className="hint">
          ≈ {item.x.toFixed(1)} m from the glass-door wall, {item.z.toFixed(1)} m from the back-bar wall.
          {touch ? "" : " Arrow keys nudge 10 cm."}
        </p>
      )}
    </div>
  );
}
