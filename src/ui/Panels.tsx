import { useEffect, useMemo, useRef, useState } from "react";
import { type Item, type Shape, isTable, shapeOf } from "../domain/layout/items";
import { FLORAL_PALETTES, FLOWER_TYPES, FLOWER_TYPE_GENERATORS } from "../domain/layout/decor";
import { LIGHT_COLOURS } from "../domain/layout/pieces";
import { adviseScenario } from "../domain/layout/advisories";
import { ARTWORKS } from "../domain/venue/art";
import { styleOf } from "../domain/scenario/scenario";
import { countLayout, tableLabels } from "../domain/layout/counts";
import { itemTitle, spotFor } from "../domain/layout/validate";
import type { Catalog } from "../domain/library/catalog";
import type { Family, ItemOption, LibraryEntry } from "../domain/library/schema";
import type { Scenario, TableStyle } from "../domain/scenario/schema";
import { ROTATE_STEP } from "../state/editor";
import { requestCamera, viewStore } from "../state/view";
import { useAdvisories, useEditor, useStudio, useView } from "../scene/context";
import { useServices } from "./services";
import { Icon } from "./icons";

export type Section = "venue" | "layout" | "people" | "decor" | "compare";

const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

/** A held −/+ starts repeating after HOLD_MS, then steps every REPEAT_MS. */
const HOLD_MS = 400;
const REPEAT_MS = 70;

/** A −/+ button that repeats while held. */
function RepeatButton({
  label,
  icon,
  disabled,
  onStep,
}: {
  label: string;
  icon: "minus" | "plus";
  disabled: boolean;
  onStep: () => void;
}) {
  const timer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const step = useRef(onStep);
  useEffect(() => {
    step.current = onStep;
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const stop = () => window.clearTimeout(timer.current);
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={() => {
        held.current = false;
        stop();
        timer.current = window.setTimeout(() => {
          held.current = true;
          timer.current = window.setInterval(() => step.current(), REPEAT_MS);
        }, HOLD_MS);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={() => {
        if (!held.current) step.current();
        held.current = false;
      }}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

/** Counts and sizes. A `figure` stepper (counts, DESIGN_GUIDE §4) also scrubs by dragging the number. */
function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  format = (v: number) => String(v),
  onChange,
  testId,
  figure = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  testId?: string;
  figure?: boolean;
}) {
  // Held buttons fire faster than React re-renders, so steps build on the last value sent.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  const scrub = useRef<{ x: number; from: number } | null>(null);
  const set = (v: number) => {
    const next = Math.round(Math.min(max, Math.max(min, v)) * 100) / 100;
    if (next === latest.current) return;
    latest.current = next;
    onChange(next);
  };
  return (
    <div className={`row ${figure ? "row-figure" : ""}`}>
      <span className="row-label">{label}</span>
      <div className="stepper" data-testid={testId}>
        <RepeatButton
          label={`Fewer: ${label}`}
          icon="minus"
          disabled={value <= min}
          onStep={() => set(latest.current - step)}
        />
        <output
          aria-live="polite"
          aria-label={label}
          className={figure ? "scrub" : ""}
          onPointerDown={(e) => {
            if (!figure) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            scrub.current = { x: e.clientX, from: latest.current };
          }}
          onPointerMove={(e) => {
            if (scrub.current) set(scrub.current.from + Math.round((e.clientX - scrub.current.x) / 8) * step);
          }}
          onPointerUp={() => (scrub.current = null)}
          onPointerCancel={() => (scrub.current = null)}
        >
          {format(value)}
        </output>
        <RepeatButton
          label={`More: ${label}`}
          icon="plus"
          disabled={value >= max}
          onStep={() => set(latest.current + step)}
        />
      </div>
    </div>
  );
}

/** Continuous values (thresholds, DESIGN_GUIDE §4): always shows the value and unit. */
function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  testId?: string;
}) {
  return (
    <label className="field slider">
      <span className="slider-head">
        <span className="row-label">{label}</span>
        <output>{format(value)}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        data-testid={testId}
      />
    </label>
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
  if (shape.kind === "piece") {
    // What matters about a piece: the words it takes, its colours, how it hangs or its size.
    const o = (key: string) => e.options.find((x) => x.key === key);
    const span = o("span");
    const hang = o("hang");
    const colours = e.options.find(
      (x) => x.type === "choice" && x.choices.every((c) => swatchColour(c.value)),
    );
    return [
      e.options.some((x) => x.type === "text") ? "Your words" : "",
      colours?.type === "choice" ? `${colours.choices.length} colours` : "",
      span?.type === "number" ? `≈ ${span.default} m span` : "",
      hang?.type === "number" && !shape.blocks ? `hangs at ≈ ${metres(hang.default)}` : "",
      shape.blocks && e.family === "plant" ? `≈ ${metres(shape.height)} tall` : "",
      shape.blocks && e.family !== "plant" ? `≈ ${shape.width.toFixed(1)} × ${shape.depth.toFixed(1)} m` : "",
    ]
      .filter(Boolean)
      .join(" · ")
      .replace(/^./, (c) => c.toUpperCase());
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
            : shape.kind === "backdrop"
              ? `Fabric panels · ≈ ${shape.width} × ${shape.height} m`
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

/** Advisory checks and their settings (LAY-08). Rows select the tables involved. */
function Checks() {
  const { editor } = useStudio();
  const list = useAdvisories();
  const thresholds = useEditor((s) => s.scenarios[s.activeId]?.thresholds);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  if (!thresholds) return null;
  // The tightest come first; three are enough to act on, the rest on request.
  const shown = all ? list : list.slice(0, 3);
  return (
    <div className="field" data-testid="checks" id="checks">
      <h3 className="group-title">
        {list.length ? `${list.length} ${list.length === 1 ? "advisory" : "advisories"}` : "Checks"}
      </h3>
      {list.length === 0 ? (
        <p className="hint">No advisories with your settings.</p>
      ) : (
        <ul className="advisories" aria-label="Advisories">
          {shown.map((a) => (
            <li key={a.id}>
              {a.items.length ? (
                <button type="button" className="advisory-row" onClick={() => editor.select(a.items)}>
                  <span className="dot" aria-hidden="true" />
                  <span>{a.message}</span>
                  <Icon name="chevron" size={16} className="advisory-go" />
                </button>
              ) : (
                <span className="advisory-row">
                  <span className="dot" aria-hidden="true" />
                  <span>{a.message}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {list.length > 3 && (
        <button
          type="button"
          className="plain-btn"
          onClick={() => setAll((v) => !v)}
          data-testid="checks-all"
        >
          {all ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
      <button
        type="button"
        className="plain-btn"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="check-settings"
      >
        {open ? "Hide check settings" : "Check settings"}
      </button>
      {open && (
        <>
          <Slider
            label="Aisle between chair backs"
            value={thresholds.aisleM}
            min={0.6}
            max={2}
            step={0.1}
            format={metres}
            onChange={(v) => editor.setThreshold("aisleM", v)}
            testId="aisle"
          />
          <Slider
            label="Clear in front of doors"
            value={thresholds.clearanceM}
            min={0.6}
            max={2.5}
            step={0.1}
            format={metres}
            onChange={(v) => editor.setThreshold("clearanceM", v)}
          />
          <Slider
            label="Space per dancer"
            value={thresholds.m2PerDancer}
            min={0.3}
            max={1}
            step={0.05}
            format={(v) => `${v.toFixed(2)} m²`}
            onChange={(v) => editor.setThreshold("m2PerDancer", v)}
          />
          <Slider
            label="Guests dancing at once"
            value={Math.round(thresholds.dancingShare * 100)}
            min={10}
            max={80}
            step={5}
            format={(v) => `${v}%`}
            onChange={(v) => editor.setThreshold("dancingShare", v / 100)}
          />
        </>
      )}
      <p className="hint">Checks are approximate aids, not code or capacity compliance.</p>
    </div>
  );
}

/** The library section last chosen, kept while the app is open (the panel remounts often). */
let lastCategory: Family = "table";

/** Library sections, in the order a couple plans a room. */
const LIBRARY_CATEGORIES: { id: Family; name: string }[] = [
  { id: "table", name: "Tables" },
  { id: "eventPiece", name: "Event" },
  { id: "floral", name: "Florals" },
  { id: "plant", name: "Plants" },
  { id: "light", name: "Lights" },
  { id: "sign", name: "Signs" },
];

export function LayoutPanel() {
  const { catalog, editor } = useStudio();
  const snapping = useEditor((s) => s.snapping);
  const placeable = useMemo(
    () =>
      [...catalog.values()].filter(
        (e) => e.placement !== "table" && e.placement !== "material" && e.family !== "chair",
      ),
    [catalog],
  );
  const [category, setCategory] = useState<Family>(lastCategory);
  const shown = placeable.filter((e) => e.family === category);
  return (
    <div className="panel-body" data-testid="layout-panel">
      <h2 className="panel-title">Layout</h2>
      <Checks />
      <h3 className="group-title">Add to the room</h3>
      <Chips
        label="Library"
        options={LIBRARY_CATEGORIES.filter((c) => placeable.some((e) => e.family === c.id))}
        value={category}
        onPick={(id) => setCategory((lastCategory = id as Family))}
        testId="category"
        wrap
      />
      <ul className="library" aria-label="Library">
        {shown.map((e) => (
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
        {touch ? "Press and hold an item, then drag it." : "Drag an item to move it."} Sizes are approximate.
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
        {label}
        {current && <span className="row-value"> · {current.name}</span>}
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
  wrap = false,
}: {
  label: string;
  options: { id: string; name: string }[];
  value: string;
  onPick: (id: string) => void;
  testId: string;
  /** Always wrap (navigation, where a hidden choice must never be missed). */
  wrap?: boolean;
}) {
  return (
    <div className="field">
      <span className="row-label">{label}</span>
      <div
        className={`chips ${!wrap && options.length > 5 ? "chips-scroll" : ""}`}
        role="radiogroup"
        aria-label={label}
      >
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
  const family = (f: string, generator?: string) =>
    [...catalog.values()].filter(
      (e) =>
        e.family === f && (!generator || (e.model.kind === "parametric" && e.model.generator === generator)),
    );
  const colourOf = (id: string) => {
    const model = catalog.get(id)?.model;
    return model?.kind === "parametric" ? String(model.params.colour ?? "var(--sunk)") : "var(--sunk)";
  };
  const none = { id: "none", name: "None" };
  const [flowersOpen, setFlowersOpen] = useState(false);
  // Flower types shape mounded arrangements; bud vases and the garland take only colours.
  const floral = catalog.get(shown.florals)?.model;
  const typed = floral?.kind === "parametric" && FLOWER_TYPE_GENERATORS.includes(floral.generator);
  const labels = tableLabels(scenario.items, catalog);
  return (
    <div className="panel-body" data-testid="decor-panel">
      <h2 className="panel-title">Décor</h2>
      {tables.length > 0 ? (
        <Segmented
          label="Apply to"
          value={scope}
          options={[
            {
              value: "selected",
              label:
                tables[0] && tables.length === 1
                  ? itemTitle(tables[0], labels, catalog)
                  : `${tables.length} tables`,
            },
            { value: "all", label: "All tables" },
          ]}
          onChange={setScope}
        />
      ) : (
        <p className="hint">Applies to all tables. Select tables first to dress just those.</p>
      )}
      <Swatches
        label="Linen"
        options={family("linen", "linen").map((e) => ({
          id: e.id,
          name: e.name.replace(" tablecloth", ""),
          colour: colourOf(e.id),
        }))}
        value={shown.linen}
        onPick={(id) => apply({ linen: id })}
        testId="linen"
      />
      <Chips
        label="Runner"
        options={[
          none,
          ...family("linen", "runner").map((e) => ({ id: e.id, name: e.name.replace(" runner", "") })),
        ]}
        value={shown.runner}
        onPick={(id) => apply({ runner: id })}
        testId="runner"
      />
      <Chips
        label="Candles"
        options={[none, ...family("candle").map((e) => ({ id: e.id, name: e.name }))]}
        value={shown.candles}
        onPick={(id) => apply({ candles: id })}
        testId="candles"
      />
      <Chips
        label="Florals"
        options={[
          none,
          ...family("floral")
            .filter((e) => e.placement === "table")
            .map((e) => ({ id: e.id, name: e.name })),
        ]}
        value={shown.florals}
        onPick={(id) => apply({ florals: id })}
        testId="florals"
      />
      {shown.florals !== "none" && (
        <>
          <button
            type="button"
            className="disclosure"
            aria-expanded={flowersOpen}
            onClick={() => setFlowersOpen((o) => !o)}
            data-testid="flowers"
          >
            <span className="row-label">Flowers</span>
            <span className="row-value">
              {typed ? `${FLOWER_TYPES[shown.flowerType]?.label} · ` : ""}
              {FLORAL_PALETTES[shown.floralColour]?.label}
            </span>
            <Icon name="chevron" size={16} />
          </button>
          {flowersOpen && (
            <>
              {typed && (
                <Chips
                  label="Flower type"
                  options={Object.entries(FLOWER_TYPES).map(([id, f]) => ({ id, name: f.label }))}
                  value={shown.flowerType}
                  onPick={(id) => apply({ flowerType: id })}
                  testId="flower-type"
                />
              )}
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
            </>
          )}
        </>
      )}
      <Chips
        label="Chairs"
        options={family("chair").map((e) => ({ id: e.id, name: e.name.replace(" chair", "") }))}
        value={shown.chair}
        onPick={(id) => apply({ chair: id })}
        testId="chair"
      />
      <section className="group" aria-label="Place settings">
        <Toggle
          label="Place settings"
          checked={scenario.style.settings}
          onChange={(v) => editor.setStyle("settings", v)}
          testId="settings"
        />
        {scenario.style.settings && (
          <>
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
            <Swatches
              label="Napkins"
              options={[
                { id: "none", name: "None", colour: NONE_SWATCH },
                ...family("tableware", "napkin").map((e) => ({
                  id: e.id,
                  name: e.name.replace(" napkins", ""),
                  colour: colourOf(e.id),
                })),
              ]}
              value={shown.napkin}
              onPick={(id) => apply({ napkin: id })}
              testId="napkin"
            />
            <Toggle
              label="Menu cards"
              checked={scenario.style.menus}
              onChange={(v) => editor.setStyle("menus", v)}
              testId="menus"
            />
          </>
        )}
      </section>
      <section className="group" aria-label="Every table">
        <h3 className="group-title">Every table</h3>
        <p className="hint">These always apply to all tables.</p>
        <div className="field">
          <span className="row-label">Tablecloth length</span>
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
        </div>
        <Toggle
          label="Table numbers"
          checked={scenario.style.tableNumbers}
          onChange={(v) => editor.setStyle("tableNumbers", v)}
          testId="table-numbers"
        />
      </section>
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
  // Suggest tables like the ones already placed (8 when there are none yet).
  const perTable = c.tables ? Math.max(1, Math.round(c.seats / c.tables)) : 8;
  const tablesNeeded = Math.ceil(c.withoutSeat / perTable);
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
        figure
      />
      <div className="figures" aria-label="Seating">
        <div className="figure">
          <b data-testid="people-seated">{seated}</b>
          <span>seated</span>
        </div>
        <div className="figure">
          <b data-testid="people-standing">{c.withoutSeat}</b>
          <span>without a seat</span>
        </div>
        <div className="figure">
          <b>{Math.max(0, c.seats - c.guests)}</b>
          <span>seats left</span>
        </div>
      </div>
      {c.withoutSeat > 0 && (
        <p className="advice" role="note">
          {c.withoutSeat} {c.withoutSeat === 1 ? "guest" : "guests"} without a seat. Add {tablesNeeded}{" "}
          {tablesNeeded === 1 ? "table" : "tables"} of {perTable}, or raise seats on existing tables.
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

/** Notes on the active scenario, signed Partner A or B (SCN-05): how the couple discusses a plan. */
function Notes() {
  const { editor } = useStudio();
  const { cloud } = useServices();
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  const [draft, setDraft] = useState("");
  const author = cloud.partner;
  const send = () => {
    if (!author) return;
    editor.addNote(draft, author);
    setDraft("");
  };
  return (
    <div className="field" data-testid="notes">
      <h3 className="group-title">Notes on {scenario.name}</h3>
      {scenario.notes.length === 0 ? (
        <p className="hint">No notes yet. Leave one for your partner.</p>
      ) : (
        <ul className="notes">
          {scenario.notes.map((n) => (
            <li key={n.id} className="note">
              <span className="avatar" aria-hidden="true">
                {n.author}
              </span>
              <div>
                <b>Partner {n.author}</b>{" "}
                <span className="note-time">
                  {new Date(n.at).toLocaleString("en-CA", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <p>{n.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {author ? (
        <p className="hint">
          Signed as Partner {author} ·{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => cloud.choosePartner(author === "A" ? "B" : "A")}
          >
            I’m Partner {author === "A" ? "B" : "A"}
          </button>
        </p>
      ) : (
        <div className="actions-row" aria-label="Sign notes as">
          {(["A", "B"] as const).map((p) => (
            <button key={p} type="button" className="btn" onClick={() => cloud.choosePartner(p)}>
              I’m Partner {p}
            </button>
          ))}
        </div>
      )}
      <form
        className="note-form"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label className="sr-only" htmlFor="note-input">
          Add a note
        </label>
        <input
          id="note-input"
          className="text-input wide"
          placeholder={author ? `Write a note as Partner ${author}` : "Choose who you are first"}
          disabled={!author}
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.currentTarget.value)}
          data-testid="note-input"
        />
        <button type="submit" className="btn" disabled={!draft.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}

/** Pick a second scenario to see beside this one, from the same camera, with both sets of counts (SCN-06). */
function CompareControls() {
  const { catalog, venue, editor } = useStudio();
  const order = useEditor((s) => s.order);
  const activeId = useEditor((s) => s.activeId);
  const scenarios = useEditor((s) => s.scenarios);
  const st = { order, activeId, scenarios };
  const compare = useView((s) => s.compare);
  const others = st.order.filter((id) => id !== st.activeId);
  const pair = [st.scenarios[st.activeId], compare ? st.scenarios[compare] : undefined].filter(
    (s): s is Scenario => !!s,
  );
  const rows = pair.map((s) => {
    const c = countLayout(s.items, s.guests.count, catalog);
    const notes = adviseScenario(s, venue, catalog).length;
    return [c.tables, c.seats, c.withoutSeat, `≈ ${Math.round(c.danceFloorM2)} m²`, notes] as const;
  });
  const labels = ["Tables", "Seats", "Without a seat", "Dance floor", "Advisories"];
  if (others.length === 0)
    return (
      <div className="field">
        <p className="hint">Compare needs a second scenario: start one from a copy of this one.</p>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            const from = st.activeId;
            editor.duplicateScenario(from);
            viewStore.setState({ compare: from });
          }}
          data-testid="compare-duplicate"
        >
          Duplicate this scenario
        </button>
      </div>
    );
  return (
    <div className="field">
      <Chips
        label="Compare with"
        options={[
          { id: "none", name: "Off" },
          ...others.map((id) => ({ id, name: st.scenarios[id]?.name ?? id })),
        ]}
        value={compare ?? "none"}
        onPick={(id) => viewStore.setState({ compare: id === "none" ? null : id })}
        testId="compare"
      />
      {pair.length === 2 && (
        <table className="compare-table" data-testid="compare-table">
          <thead>
            <tr>
              <th />
              <th scope="col">This one</th>
              <th scope="col">Other</th>
            </tr>
          </thead>
          <tbody>
            {labels.map((l, i) => {
              const differs = rows[0]?.[i] !== rows[1]?.[i];
              return (
                <tr key={l} className={differs ? "differs" : ""}>
                  <th scope="row">{l}</th>
                  {rows.map((r, j) => (
                    <td key={j}>{r[i]}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Compare (SCN-06) and notes (SCN-05). */
export function ComparePanel() {
  return (
    <div className="panel-body" data-testid="compare-panel">
      <h2 className="panel-title">Compare and discuss</h2>
      <CompareControls />
      <Notes />
    </div>
  );
}

/** "None" and "Hidden" swatches: a diagonal stroke, never a colour that could pass for white. */
const NONE_SWATCH = "linear-gradient(135deg, transparent 46%, var(--line-2) 46% 54%, transparent 54%)";

/** A painting's swatch: its palette as bands. */
const palette = (colours: readonly string[]) => `linear-gradient(135deg, ${colours.join(", ")})`;

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
      <h3 className="group-title">Paintings</h3>
      {venue.data.fixtures.paintings.map((p) => (
        <Swatches
          key={p.id}
          label={p.label}
          options={[
            { id: "current", name: "Current", colour: palette(p.palette) },
            ...ARTWORKS.map((a) => ({ id: a.id, name: a.name, colour: palette(a.palette) })),
            {
              id: "hidden",
              name: "Hidden",
              colour: NONE_SWATCH,
            },
          ]}
          value={toggles?.paintings[p.id] ?? "current"}
          onPick={(id) => editor.setPainting(p.id, id === "current" ? null : id)}
          testId={`painting-${p.id}`}
        />
      ))}
      <p className="hint">
        Main restaurant floor only. Room ≈ {venue.width} × {venue.depth} m, estimated from photos; every size
        is approximate.
      </p>
    </div>
  );
}

/** The colour a choice stands for: a hex value, a light colour or a flower palette; else null. */
function swatchColour(value: string): string | null {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (LIGHT_COLOURS[value]) return LIGHT_COLOURS[value] ?? null;
  const p = FLORAL_PALETTES[value];
  return p ? palette(p.colours) : null;
}

/** Short words for a piece (LIB-08, LIB-09); saved on Enter or leaving the field, one undo step. */
function TextOption({
  option,
  value,
  onChange,
}: {
  option: Extract<ItemOption, { type: "text" }>;
  value: string;
  onChange: (v: string) => void;
}) {
  // Null until edited, so the field always shows the stored words (after undo, or another item).
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const save = () => {
    if (draft === null) return;
    const next = draft.trim() || option.default;
    setDraft(null);
    if (next !== value) onChange(next);
  };
  return (
    <label className="field">
      <span className="row-label">{option.label}</span>
      <input
        className="text-input wide"
        value={shown}
        maxLength={option.maxLength}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        data-testid={option.key}
      />
      {shown.length >= option.maxLength - 5 && (
        <span className="hint">
          {shown.length}/{option.maxLength}
        </span>
      )}
    </label>
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
  if (option.type === "text") return <TextOption option={option} value={String(value)} onChange={set} />;
  // Choices that are colours (fabrics, lights, flower palettes) are picked by sight (DESIGN_GUIDE §4).
  const colours = option.choices.map((c) => swatchColour(c.value));
  if (colours.every((c) => c !== null))
    return (
      <Swatches
        label={option.label}
        options={option.choices.map((c, i) => ({ id: c.value, name: c.label, colour: colours[i] as string }))}
        value={String(value)}
        onPick={set}
        testId={option.key}
      />
    );
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
  const advisories = useAdvisories();
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
        <OptionField
          key={`${item.id}:${o.key}`}
          option={o}
          item={item}
          value={item.options[o.key] ?? o.default}
        />
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
  const mine = advisories.filter((a) => a.items.some((id) => ids.includes(id)));

  // Key actions sit right under the title so the phone sheet's peek height shows them (DESIGN_GUIDE §3.2).
  return (
    <div className="panel-body" data-testid="inspector">
      <div className="panel-head">
        <h2 className="panel-title">
          {items.length === 2 && items[0] && items[1]
            ? `${itemTitle(items[0], labels, catalog)} and ${itemTitle(items[1], labels, catalog).replace(/^Table /, "table ")}`
            : many
              ? `${items.length} items`
              : itemTitle(item, labels, catalog)}
        </h2>
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
        {!many && "seats" in shape && shape.seats > 0 && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              // The inspector closes, so every chair of the table is free to choose.
              editor.select([]);
              viewStore.setState({ pickSeat: item.id });
            }}
            data-testid="sit-here"
          >
            Sit here
          </button>
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
      {mine.map((a) => (
        <p key={a.id} className="advice" data-testid="item-advisory">
          {a.message} (advisory)
        </p>
      ))}
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
