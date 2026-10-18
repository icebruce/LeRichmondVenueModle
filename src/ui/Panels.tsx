import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { type Item, type Shape, isTable, shapeOf } from "../domain/layout/items";
import {
  FLORAL_PALETTES,
  FLOWER_TYPES,
  FLOWER_TYPE_GENERATORS,
  CANDLE_SPECS,
  type CandleRange,
  candleLayout,
  candleSequence,
  candleSizes,
  styleKeyOf,
  isRoomChoice,
} from "../domain/layout/decor";
import { LIGHT_COLOURS } from "../domain/layout/pieces";
import { ARTWORKS } from "../domain/venue/art";
import { styleOf } from "../domain/scenario/scenario";
import { countLayout, tableLabels } from "../domain/layout/counts";
import { itemTitle, spotFor } from "../domain/layout/validate";
import { type Catalog, listed, litThumbnail } from "../domain/library/catalog";
import { matchesSearch, searchWords } from "../domain/library/search";
import type { Family, ItemOption, LibraryEntry } from "../domain/library/schema";
import {
  type CandleKind,
  type CandleMix,
  MAX_CANDLES_PER_KIND,
  MAX_CANDLE_KINDS,
  type Scenario,
  type TableStyle,
} from "../domain/scenario/schema";
import { ROTATE_STEP } from "../state/editor";
import { LIBRARY_DRAG, requestCamera, viewStore } from "../state/view";
import { libraryStore } from "../state/library";
import { TIERS, type TierChoice, graphicsStore, tierChoices } from "../state/graphics";
import { useAdvisories, useEditor, useStudio, useView } from "../scene/context";
import { Icon, type IconName } from "./icons";
import { RESULT_LABELS, requestStatus } from "../domain/library/imported";

/** The five sections, in rail and tab-bar order (DESIGN_GUIDE §3). */
export type Section = "room" | "add" | "style" | "guests" | "plans";

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
  sub,
  checked,
  onChange,
  testId,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <label className="row toggle">
      <span className="row-label">
        {label}
        {sub && <span className="nav-sub">{sub}</span>}
      </span>
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

export function Segmented<T extends string>({
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

/** The fidelity label every imported item carries (DESIGN_GUIDE §1.6); none on built-in items. */
export function ResultBadge({ entry }: { entry: LibraryEntry }) {
  if (!entry.imported) return null;
  return <span className="badge">{RESULT_LABELS[entry.imported.result]}</span>;
}

export function Thumb({ entry, size = 44 }: { entry: LibraryEntry; size?: number }) {
  // Imported items carry their own small photo; built-in ones a rendered thumbnail file.
  const src = entry.thumbnail.startsWith("data:")
    ? entry.thumbnail
    : `${import.meta.env.BASE_URL}assets/${entry.thumbnail}`;
  return (
    <span className={`library-icon ${size > 44 ? "large" : ""} ${litThumbnail(entry) ? "dark" : ""}`}>
      <img src={src} alt="" width={size} height={size} />
    </span>
  );
}

/** A page inside a section starts at its top when `key` changes (every page shares one scroll area). */
export function useTopOnChange(key: string) {
  useEffect(() => {
    document.querySelector(".panel-scroll")?.scrollTo({ top: 0 });
  }, [key]);
}

/** A page's title, with a way back to where it was opened from (DESIGN_GUIDE §3, one level deep). */
export function PageHead({
  title,
  back,
  onBack,
  action,
}: {
  title: React.ReactNode;
  back?: string;
  onBack?: () => void;
  action?: React.ReactNode;
}) {
  const head = (
    <div className="panel-head">
      <h2 className="panel-title">{title}</h2>
      {action}
    </div>
  );
  if (!back) return head;
  return (
    <div className="page-head">
      <button type="button" className="back-btn" onClick={onBack} data-testid="back">
        <Icon name="back" size={18} />
        {back}
      </button>
      {head}
    </div>
  );
}

/** A row that opens a page: its name, an optional line under it, its current value and a chevron. */
export function NavRow({
  label,
  sub,
  value,
  lead,
  onClick,
  testId,
}: {
  label: string;
  sub?: string;
  value?: string;
  /** A picture or icon before the label (Style's summary rows). */
  lead?: React.ReactNode;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button type="button" className="nav-row" onClick={onClick} data-testid={testId}>
      {lead}
      <span className="nav-label">
        {label}
        {sub && <span className="nav-sub">{sub}</span>}
      </span>
      {value && <span className="nav-value">{value}</span>}
      <Icon name="next" size={16} className="nav-chevron" />
    </button>
  );
}

/** The checks (LAY-08), tightest first; a row selects the items involved. Advice only, never a block. */
export function ChecksList({
  onAdjust,
  onClose,
  phone,
}: {
  onAdjust: () => void;
  onClose: () => void;
  phone: boolean;
}) {
  const { editor } = useStudio();
  const list = useAdvisories();
  const [all, setAll] = useState(false);
  // The tightest come first; three are enough to act on, the rest on request.
  const shown = all ? list : list.slice(0, 3);
  return (
    <div className="panel-body" data-testid="checks" id="checks">
      <div className="panel-head">
        <h2 className={phone ? "panel-title" : "pop-title"}>
          {list.length ? `${list.length} ${list.length === 1 ? "check" : "checks"}` : "Checks"}
        </h2>
        {phone ? (
          <button type="button" className="plain-btn" onClick={onClose}>
            Done
          </button>
        ) : (
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close checks">
            <Icon name="close" />
          </button>
        )}
      </div>
      <p className="hint">Places tighter than your layout rules. Advice only: nothing is blocked.</p>
      {list.length === 0 ? (
        <p className="hint">Nothing is tighter than your rules.</p>
      ) : (
        <ul className="advisories" aria-label="Checks">
          {shown.map((a) => (
            <li key={a.id}>
              {a.items.length ? (
                <button type="button" className="advisory-row" onClick={() => editor.select(a.items)}>
                  <span className="dot" aria-hidden="true" />
                  <span>{a.message}</span>
                  <Icon name="next" size={16} className="advisory-go" />
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
      <div className="list">
        <NavRow label="Adjust layout rules" onClick={onAdjust} testId="check-settings" />
      </div>
    </div>
  );
}

/** One line under a rule: what it changes right now, so a slider visibly does something. */
function Effect({ n, one, many }: { n: number; one: string; many: string }) {
  return (
    <p className={`effect ${n ? "" : "ok"}`} data-testid="rule-effect">
      <span className="dot" aria-hidden="true" />
      {n ? `${n} ${n === 1 ? one : many} tighter than this` : "Nothing is tighter than this"}
    </p>
  );
}

/** Room › Layout rules (LAY-08): the thresholds the checks use, each with its live effect. */
export function LayoutRules({ onBack }: { onBack: () => void }) {
  const { editor, catalog } = useStudio();
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  const list = useAdvisories();
  const t = scenario.thresholds;
  const c = countLayout(scenario.items, scenario.guests.count, catalog);
  const tighter = (kind: string) => list.filter((a) => a.kind === kind).length;
  const canDance = Math.floor(c.danceFloorM2 / t.m2PerDancer);
  const expected = Math.round(c.guests * t.dancingShare);
  return (
    <div className="panel-body" data-testid="layout-rules">
      <PageHead title="Layout rules" back="Room" onBack={onBack} />
      <p className="hint">Rules decide when a check appears. They never move anything in the room.</p>
      <h3 className="group-title">Walking room</h3>
      <Slider
        label="Aisle between chair backs"
        value={t.aisleM}
        min={0.6}
        max={2}
        step={0.1}
        format={metres}
        onChange={(v) => editor.setThreshold("aisleM", v)}
        testId="aisle"
      />
      <Effect n={tighter("aisle")} one="aisle is" many="aisles are" />
      <Slider
        label="Clear in front of doors"
        value={t.clearanceM}
        min={0.6}
        max={2.5}
        step={0.1}
        format={metres}
        onChange={(v) => editor.setThreshold("clearanceM", v)}
      />
      <Effect n={tighter("clearance")} one="doorway is" many="doorways are" />
      <h3 className="group-title">Dance area</h3>
      <div className="figures" aria-label="Dance area">
        <div className="figure">
          <b>≈ {Math.round(c.danceFloorM2)} m²</b>
          <span>placed</span>
        </div>
        <div className="figure">
          <b data-testid="can-dance">≈ {canDance}</b>
          <span>can dance</span>
        </div>
        <div className="figure">
          <b>≈ {expected}</b>
          <span>expected</span>
        </div>
      </div>
      <Slider
        label="Space per dancer"
        value={t.m2PerDancer}
        min={0.3}
        max={1}
        step={0.05}
        format={(v) => `${v.toFixed(2)} m²`}
        onChange={(v) => editor.setThreshold("m2PerDancer", v)}
      />
      <Slider
        label="Guests dancing at once"
        value={Math.round(t.dancingShare * 100)}
        min={10}
        max={80}
        step={5}
        format={(v) => `${v}%`}
        onChange={(v) => editor.setThreshold("dancingShare", v / 100)}
      />
      <p className={`effect ${canDance >= expected ? "ok" : ""}`}>
        <span className="dot" aria-hidden="true" />
        {canDance >= expected
          ? "The dance area fits, with room to spare"
          : `Room for ≈ ${canDance} of the ≈ ${expected} expected dancers`}
      </p>
      <p className="hint">Checks are approximate aids, not code or capacity compliance.</p>
    </div>
  );
}

/** The library section last chosen, kept while the app is open (the panel remounts often). */
let lastCategory: Family | "yours" = "table";

/** Opens the library at "Yours" next time it shows (a custom model request starts there). */
export function showYours() {
  lastCategory = "yours";
}

/** Library sections, in the order a couple plans a room; "Yours" holds imports and requests. */
const LIBRARY_CATEGORIES: { id: Family | "yours"; name: string }[] = [
  { id: "table", name: "Tables" },
  { id: "eventPiece", name: "Event" },
  { id: "floral", name: "Florals" },
  { id: "plant", name: "Plants" },
  { id: "light", name: "Lights" },
  { id: "sign", name: "Signs" },
  { id: "chair", name: "Lounge" },
  { id: "yours", name: "Yours" },
];

/**
 * What a search matches: every word starts a word of the name, the caption or the category
 * ("candles" finds the candle family, "centerpiece" the centrepieces).
 */
function matches(e: LibraryEntry, words: string[], catalog: Catalog): boolean {
  const family = LIBRARY_CATEGORIES.find((c) => c.id === e.family)?.name ?? e.family;
  const key = styleKeyOf(e);
  return matchesSearch(
    words,
    `${e.name} ${caption(e, catalog)} ${family} ${e.family} ${key ? DRESSING[key] : ""}`,
  );
}

/** What a piece of table dressing is, on its row under "For the tables". */
const DRESSING: Record<string, string> = {
  linen: "Tablecloth",
  runner: "Runner",
  napkin: "Napkins",
  chair: "Chairs",
  candles: "Candles",
  florals: "Centrepiece",
};

/** Sizes read as one unit and never break across lines ("≈ 2.8 m", "0.9 × 0.9 m"). */
const keepUnits = (s: string) =>
  s
    .replace(/≈ /g, "≈\u00a0")
    .replace(/ × /g, "\u00a0×\u00a0")
    .replace(/ (m|cm|m²)\b/g, "\u00a0$1");

/**
 * Add (LAY-01, LIB-01..13): the one library. Pieces to place, by category or by search, as a grid
 * of pictures: click (or drag into the room on desktop) to add. A search also finds table dressing
 * (linens, candles, centrepieces, chairs) to use on every table. "Yours" holds the couple's own
 * imports and requests, drawn by `yours` under the same title and categories.
 */
export function AddPanel({
  onAdded,
  yours,
}: {
  onAdded: () => void;
  yours: (head: React.ReactNode) => React.ReactNode;
}) {
  const { catalog, editor } = useStudio();
  const requests = useStore(libraryStore, (s) => s.requests);
  const style = useEditor((s) => s.scenarios[s.activeId]?.style);
  const hasTables = useEditor((s) => !!s.scenarios[s.activeId]?.items.some((i) => isTable(i, catalog)));
  const live = useMemo(() => [...catalog.values()].filter(listed), [catalog]);
  const placeable = useMemo(
    () =>
      live.filter(
        // Table chairs are a décor choice; lounge seating is placed like any piece.
        // Photo templates need a photo (Yours).
        (e) =>
          e.placement !== "table" &&
          e.placement !== "material" &&
          !(e.model.kind === "parametric" && e.model.generator === "chair") &&
          !(e.model.kind === "parametric" && e.model.generator === "photo" && !e.model.params.image),
      ),
    [live],
  );
  const [category, setCategory] = useState(lastCategory);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const words = searchWords(query);
  useTopOnChange(category);
  // A custom model that is ready marks the Yours chip.
  const ready = requests.some((r) => requestStatus(r, catalog).status === "ready");
  const pick = (id: string) => {
    setQuery("");
    setCategory((lastCategory = id as Family | "yours"));
  };
  const head = (
    <>
      {/* Title and search stay in view while the pictures scroll under them. */}
      <div className="page-head">
        <PageHead title="Add" />
        <label className="search">
          <Icon name="search" size={18} />
          <span className="sr-only">Search the library</span>
          <input
            ref={input}
            type="search"
            value={query}
            placeholder="Search tables, lights, florals…"
            onChange={(e) => setQuery(e.currentTarget.value)}
            data-testid="library-search"
          />
          {query && (
            <button
              type="button"
              className="icon-btn search-clear"
              onClick={() => {
                setQuery("");
                input.current?.focus();
              }}
              aria-label="Clear search"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </label>
      </div>
      <Chips
        label="Library"
        options={LIBRARY_CATEGORIES.filter(
          (c) => c.id === "yours" || placeable.some((e) => e.family === c.id),
        ).map((c) => ({ ...c, dot: c.id === "yours" && ready }))}
        value={words.length ? "" : category}
        onPick={pick}
        testId="category"
        wrap
        hideLabel
      />
    </>
  );
  if (!words.length && category === "yours") return yours(head);

  const shown = words.length
    ? placeable.filter((e) => matches(e, words, catalog))
    : placeable.filter((e) => e.family === category);
  const dressing = words.length ? live.filter((e) => styleKeyOf(e) && matches(e, words, catalog)) : [];
  // Already the room-wide choice (DEC-01): nothing to do but say so.
  const onTables = (e: LibraryEntry) => !!style && isRoomChoice(style, e);
  return (
    <div className="panel-body" data-testid="layout-panel">
      {head}
      {shown.length > 0 && dressing.length > 0 && <h3 className="group-title">To place</h3>}
      {shown.length > 0 && (
        <ul className="tiles" aria-label="Library">
          {shown.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="tile"
                draggable={!touch}
                onDragStart={(ev) => {
                  ev.dataTransfer.setData(LIBRARY_DRAG, e.id);
                  ev.dataTransfer.effectAllowed = "copy";
                  // Only the picture follows the pointer; the room shows where it will land.
                  const img = ev.currentTarget.querySelector("img");
                  if (img) ev.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
                  viewStore.setState({ dropping: { id: e.id, at: null } });
                }}
                onDragEnd={() => viewStore.setState({ dropping: null })}
                onClick={() => {
                  if (editor.addItem(e.id, viewStore.getState().focus)) onAdded();
                }}
                data-testid={`add-${e.id}`}
              >
                <Thumb entry={e} />
                <span className="tile-name">{e.name.replace(/-/g, "\u2011")}</span>
                <span className="tile-caption">
                  {e.imported && <ResultBadge entry={e} />} {keepUnits(caption(e, catalog))}
                </span>
                <span className="tile-add" aria-hidden="true">
                  <Icon name="plus" size={16} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {dressing.length > 0 && (
        <>
          <h3 className="group-title">For the tables</h3>
          <div className="list">
            {dressing.map((e) => {
              const key = styleKeyOf(e);
              const on = onTables(e);
              return (
                <div key={e.id} className="row">
                  <Thumb entry={e} />
                  <span className="nav-label">
                    {e.name}
                    <span className="nav-sub">{key ? DRESSING[key] : ""}</span>
                  </span>
                  <button
                    type="button"
                    className={`btn small ${on ? "on-tables" : ""}`}
                    disabled={on || !hasTables}
                    title={hasTables ? undefined : "Add a table first"}
                    onClick={() => editor.placeOrUse(e.id, viewStore.getState().focus)}
                    data-testid={`use-${e.id}`}
                  >
                    {on ? (
                      <>
                        <Icon name="check" size={16} /> On tables
                      </>
                    ) : (
                      "Use on tables"
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
      {words.length > 0 && !shown.length && !dressing.length && (
        <p className="hint">Nothing called “{query.trim()}” yet.</p>
      )}
      {shown.length > 0 && (
        <p className="hint">
          {touch
            ? "Tap to add at the centre of the view."
            : "Click to add at the centre of the view, or drag a piece into the room."}{" "}
          Sizes are approximate.
        </p>
      )}
      <button type="button" className="more" onClick={() => pick("yours")} data-testid="cant-find">
        <Icon name="camera" size={18} />
        <span className="nav-label">
          Can’t find it?
          <span className="nav-sub">Add it from a photo, or ask for a custom model.</span>
        </span>
        <Icon name="next" size={16} className="nav-chevron" />
      </button>
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

export function Chips({
  label,
  options,
  value,
  onPick,
  testId,
  wrap = false,
  hideLabel = false,
}: {
  label: string;
  options: { id: string; name: string; dot?: boolean }[];
  value: string;
  onPick: (id: string) => void;
  testId: string;
  /** Always wrap (navigation, where a hidden choice must never be missed). */
  wrap?: boolean;
  /** The chips explain themselves (the library's categories): the label is for screen readers. */
  hideLabel?: boolean;
}) {
  // A sideways-scrolling row keeps its chosen chip in view (an imported item comes last).
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const r = row.current;
    const on = r?.querySelector<HTMLElement>(".chip.on");
    if (!r || !on || r.scrollWidth <= r.clientWidth) return;
    const left = on.offsetLeft - r.offsetLeft;
    if (left < r.scrollLeft || left + on.offsetWidth > r.scrollLeft + r.clientWidth)
      r.scrollLeft = left - (r.clientWidth - on.offsetWidth) / 2;
  }, [value]);
  return (
    <div className="field">
      <span className={hideLabel ? "sr-only" : "row-label"}>{label}</span>
      <div
        ref={row}
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
            {o.dot && (
              <>
                <span className="chip-dot" aria-hidden="true" />
                <span className="sr-only">, a custom model is ready</span>
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The Style section's own pages, opened from its summary rows (DESIGN_GUIDE §4 Style); a candle
 * kind's sizes (`candle:<id>`) open from Candles.
 */
export type StylePage = "runner" | "candles" | "centrepiece" | "chairs" | "settings" | `candle:${string}`;

/** The page a Style page steps back to: a candle kind's sizes to Candles, the others to Style. */
export const parentPage = (p: StylePage): StylePage | null => (p.startsWith("candle:") ? "candles" : null);

const CHARGERS = [
  { id: "gold", name: "Gold" },
  { id: "silver", name: "Silver" },
  { id: "glass", name: "Glass" },
  { id: "none", name: "None" },
];

const STYLE_PAGES: Record<Exclude<StylePage, `candle:${string}`>, string> = {
  runner: "Runner",
  candles: "Candles",
  centrepiece: "Centrepiece",
  chairs: "Chairs",
  settings: "Place settings",
};

/** A shuffle's seed for the candle order (DEC-02); 0 is kept for tallest in the middle. */
const newSeed = () => 1 + Math.floor(Math.random() * 2 ** 31);

/** A figure in its unit, kept on one line: "22.5 cm", "15°". */
const withUnit = (v: number, unit: string) =>
  `${Number.isInteger(v) ? v : v.toFixed(1)}${unit.replace(" ", "\u00a0")}`;

/**
 * A size row (DEC-02): its name (and a line under it), then − / + in the size's steps with a plain
 * figure and its unit; `less` and `more` name the buttons ("Narrower", "Taller pillar 2").
 */
function SizeStepper({
  label,
  sub,
  value,
  range,
  unit = " cm",
  less,
  more,
  onSet,
  testId,
}: {
  label: string;
  sub?: string;
  value: number;
  range: Pick<CandleRange, "min" | "max" | "step">;
  unit?: string;
  less: string;
  more: string;
  onSet: (v: number) => void;
  testId: string;
}) {
  const to = (v: number) => onSet(Math.min(range.max, Math.max(range.min, Math.round(v * 100) / 100)));
  return (
    <div className="row">
      {sub ? (
        <span className="nav-label">
          {label}
          <span className="nav-sub">{sub}</span>
        </span>
      ) : (
        <span className="row-label">{label}</span>
      )}
      <div className="stepper">
        <RepeatButton
          label={less}
          icon="minus"
          disabled={value <= range.min}
          onStep={() => to(value - range.step)}
        />
        <output className="size" aria-label={label} data-testid={testId}>
          {withUnit(value, unit)}
        </output>
        <RepeatButton
          label={more}
          icon="plus"
          disabled={value >= range.max}
          onStep={() => to(value + range.step)}
        />
      </div>
    </div>
  );
}

const paramsOf = (e: LibraryEntry | undefined) => (e?.model.kind === "parametric" ? e.model.params : {});
const generatorOf = (e: LibraryEntry | undefined) =>
  e?.model.kind === "parametric" ? e.model.generator : "";

/** A candle kind's heights on one line: "10–22.5 cm", "3 arms · 65 cm", a votive's size; null if none. */
function kindSizes(kind: CandleKind, e: LibraryEntry | undefined): string | null {
  const g = generatorOf(e);
  const spec = CANDLE_SPECS[g];
  if (!spec) return null;
  const all = Array.from({ length: kind.n }, (_, i) => candleSizes(g, kind, i, paramsOf(e)));
  const [first] = all;
  if (!first) return null;
  if (!spec.height) return withUnit(first.w, " cm");
  const lo = Math.min(...all.map((s) => s.h));
  const hi = Math.max(...all.map((s) => s.h));
  // Word joiners keep a range on one line.
  const heights = lo === hi ? withUnit(hi, " cm") : `${withUnit(lo, "")}\u2060–\u2060${withUnit(hi, " cm")}`;
  return spec.arms ? `${first.arms} ${first.arms === 1 ? "arm" : "arms"} · ${heights}` : heights;
}

/**
 * A candle kind's settings (DEC-02, owner 2026-10-17): how many per table, a candelabra's arms, then
 * each size the kind has, in cm (a height for each candle where the kind has one each).
 */
function CandleKindSizes({
  kind,
  entry,
  onChange,
}: {
  kind: CandleKind;
  entry: LibraryEntry | undefined;
  onChange: (k: CandleKind) => void;
}) {
  const g = generatorOf(entry);
  const spec = CANDLE_SPECS[g] ?? {};
  const at = (i: number) => candleSizes(g, kind, i, paramsOf(entry));
  const first = at(0);
  const heights = Array.from({ length: kind.n }, (_, i) => at(i).h);
  const each = spec.height?.each ? spec.height : null;
  // Back to the kind as first built; only its count stays.
  const changed =
    kind.w !== undefined || kind.h !== undefined || kind.holder !== undefined || kind.arms !== undefined;
  const reset = () => onChange({ id: kind.id, n: kind.n });
  return (
    <>
      <div className="list">
        <SizeStepper
          label="Per table"
          value={kind.n}
          range={{ min: 1, max: MAX_CANDLES_PER_KIND, step: 1 }}
          unit=""
          less="Fewer per table"
          more="More per table"
          onSet={(n) => onChange({ ...kind, n })}
          testId="candle-count"
        />
        {spec.arms && (
          <div className="row">
            <span className="row-label">Arms</span>
            <div className="seg seg-arms" role="radiogroup" aria-label="Arms">
              {spec.arms.options.map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={first.arms === a}
                  className={first.arms === a ? "on" : ""}
                  onClick={() => onChange({ ...kind, arms: a })}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}
        {spec.width && (
          <SizeStepper
            label={spec.width.label}
            value={first.w}
            range={spec.width}
            less={spec.height ? "Narrower" : "Smaller"}
            more={spec.height ? "Wider" : "Bigger"}
            onSet={(w) => onChange({ ...kind, w })}
            testId="candle-width"
          />
        )}
        {spec.height && !each && (
          <SizeStepper
            label={spec.height.label}
            value={first.h}
            range={spec.height}
            less={`Lower ${spec.height.label.toLowerCase()}`}
            more={`Taller ${spec.height.label.toLowerCase()}`}
            onSet={(h) => onChange({ ...kind, h: [h] })}
            testId="candle-height"
          />
        )}
        {spec.holder && (
          <SizeStepper
            label={spec.holder.label}
            value={first.holder}
            range={spec.holder}
            less="Lower holder"
            more="Taller holder"
            onSet={(holder) => onChange({ ...kind, holder })}
            testId="candle-holder"
          />
        )}
      </div>
      {each && (
        <>
          <h3 className="group-title">Heights</h3>
          <div className="list">
            {heights.map((h, i) => (
              <SizeStepper
                key={i}
                label={`${each.label} ${i + 1}`}
                value={h}
                range={each}
                less={`Lower ${each.label.toLowerCase()} ${i + 1}`}
                more={`Taller ${each.label.toLowerCase()} ${i + 1}`}
                onSet={(v) => onChange({ ...kind, h: heights.map((x, j) => (j === i ? v : x)) })}
                testId={`candle-height-${i}`}
              />
            ))}
          </div>
        </>
      )}
      <button
        type="button"
        className="plain-btn start"
        disabled={!changed}
        onClick={reset}
        data-testid="candle-reset"
      >
        Reset sizes
      </button>
    </>
  );
}

/**
 * A grid of pictures to choose from, "None" first when offered. A chosen picture carries a check,
 * or its `count` (the candle mix), so a tap is answered where the finger is.
 */
function PickGrid({
  label,
  options,
  isOn,
  onPick,
  testId,
  none,
  count,
  nameOf = (e) => e.name,
}: {
  label: string;
  options: LibraryEntry[];
  isOn: (id: string) => boolean;
  onPick: (id: string) => void;
  testId: string;
  none?: boolean;
  count?: (id: string) => number | undefined;
  nameOf?: (e: LibraryEntry) => string;
}) {
  return (
    <ul className="tiles g3" aria-label={label}>
      {none && (
        <li>
          <button
            type="button"
            className={`tile ${isOn("none") ? "on" : ""}`}
            aria-pressed={isOn("none")}
            onClick={() => onPick("none")}
            data-testid={`${testId}-none`}
          >
            <span className="library-icon none-icon" aria-hidden="true" />
            <span className="tile-name">None</span>
          </button>
        </li>
      )}
      {options.map((e) => {
        const on = isOn(e.id);
        return (
          <li key={e.id}>
            <button
              type="button"
              className={`tile ${on ? "on" : ""}`}
              aria-pressed={on}
              onClick={() => onPick(e.id)}
              data-testid={`${testId}-${e.id}`}
            >
              <Thumb entry={e} />
              <span className="tile-name">{nameOf(e)}</span>
              {e.imported && (
                <span className="tile-caption">
                  <ResultBadge entry={e} />
                </span>
              )}
              {on && (
                <span className="tile-check" aria-hidden="true">
                  {count?.(e.id) !== undefined ? `×${count(e.id)}` : <Icon name="check" size={14} />}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Style (DEC-01..05, LIB-03..06): the linen, then one summary row per part of the table dressing
 * (runner, candles, centrepiece, chairs, place settings) opening its picture grid; applied to every
 * table, or to the selected ones. Placements never move.
 */
export function StylePanel({ page, open }: { page: StylePage | null; open: (p: StylePage | null) => void }) {
  const { editor, catalog } = useStudio();
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  const selection = useEditor((s) => s.selection);
  const tables = scenario.items.filter((i) => selection.includes(i.id) && isTable(i, catalog));
  const [scope, setScope] = useState<"all" | "selected">(tables.length ? "selected" : "all");
  const target = scope === "selected" && tables.length ? tables.map((t) => t.id) : "all";
  const shown = target !== "all" && tables[0] ? styleOf(tables[0], scenario.style) : scenario.style;
  const apply = (patch: Partial<TableStyle>) => editor.applyStyle(target, patch);
  const used = (id: string) =>
    [shown.linen, shown.runner, shown.florals, shown.chair, shown.napkin].includes(id) ||
    shown.candles.some((m) => m.id === id);
  // Imported items join these lists with their label (IMP-06); removed ones only stay where used.
  const family = (f: string, generator?: string) =>
    [...catalog.values()].filter(
      (e) =>
        e.family === f &&
        (listed(e) || used(e.id)) &&
        (!generator || (e.model.kind === "parametric" && e.model.generator === generator)),
    );
  const colourOf = (id: string) => {
    const model = catalog.get(id)?.model;
    return model?.kind === "parametric" ? String(model.params.colour ?? "var(--sunk)") : "var(--sunk)";
  };
  // Imported items keep their fidelity label wherever their name shows (DESIGN_GUIDE §1.6).
  const nameOf = (id: string) => {
    if (id === "none") return "None";
    const e = catalog.get(id);
    return e?.imported ? `${e.name} · ${RESULT_LABELS[e.imported.result]}` : (e?.name ?? id);
  };
  const labels = tableLabels(scenario.items, catalog);
  const floral = catalog.get(shown.florals)?.model;
  // Flower types shape mounded arrangements; bud vases and the garland take only colours.
  const typed = floral?.kind === "parametric" && FLOWER_TYPE_GENERATORS.includes(floral.generator);

  const scopeControl =
    tables.length > 0 ? (
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
      <p className="hint">Applies to every table. Select tables in the room to style just those.</p>
    );

  if (page) {
    const mix = shown.candles;
    const setMix = (next: CandleMix) => apply({ candles: next });
    // A candle kind's sizes; once the kind is off the table, Candles itself.
    const kind = page.startsWith("candle:") ? mix.find((m) => `candle:${m.id}` === page) : undefined;
    const view = page.startsWith("candle:") && !kind ? "candles" : page;
    const setKind = (k: CandleKind) => setMix(mix.map((m) => (m.id === k.id ? k : m)));
    const total = mix.reduce((t, m) => t + m.n, 0);
    // Shuffle only where the order shows (DEC-02): different kinds or heights; each shuffle a new order.
    const sequence = candleSequence(shown, catalog).join();
    const varied = new Set(candleSequence({ ...shown, candleOrder: 0 }, catalog)).size > 1;
    const shuffle = () => {
      let seed = newSeed();
      for (
        let i = 0;
        i < 8 && candleSequence({ ...shown, candleOrder: seed }, catalog).join() === sequence;
        i++
      )
        seed = newSeed();
      apply({ candleOrder: seed });
    };
    // Tables too small or too full for the whole mix show what fits (DEC-02): say on how many of
    // the tables being styled.
    const short =
      view === "candles" || kind
        ? (target === "all" ? scenario.items.filter((i) => isTable(i, catalog)) : tables).filter((t) => {
            const fit = candleLayout(
              shapeOf(t, catalog),
              styleOf(t, scenario.style),
              catalog,
              scenario.style,
            );
            return fit.placed < fit.wanted;
          }).length
        : 0;
    return (
      <div className="panel-body" data-testid={kind ? "style-candle-kind" : `style-${view}`}>
        {kind ? (
          <PageHead title={nameOf(kind.id)} back="Candles" onBack={() => open("candles")} />
        ) : (
          <PageHead
            title={STYLE_PAGES[view as keyof typeof STYLE_PAGES]}
            back="Style"
            onBack={() => open(null)}
          />
        )}
        {tables.length > 0 && scopeControl}
        {kind && (
          <>
            {short > 0 && (
              <p className="hint advisory" data-testid="candles-short">
                {short === 1 ? "One table has" : `${short} tables have`} room for fewer.
              </p>
            )}
            <CandleKindSizes kind={kind} entry={catalog.get(kind.id)} onChange={setKind} />
          </>
        )}
        {view === "runner" && (
          <PickGrid
            label="Runner"
            none
            options={family("linen", "runner")}
            nameOf={(e) => e.name.replace(/ runner$/i, "")}
            isOn={(id) => shown.runner === id}
            onPick={(id) => apply({ runner: id })}
            testId="runner"
          />
        )}
        {view === "candles" && (
          <>
            {short > 0 && (
              <p className="hint advisory" data-testid="candles-short">
                {short === 1 ? "One table has" : `${short} tables have`} room for fewer; they show the candles
                that fit.
              </p>
            )}
            {mix.length > 0 && (
              <div className="list" aria-label="On each table">
                {mix.map((m, i) => {
                  const e = catalog.get(m.id);
                  const set = (n: number) => setMix(mix.map((x, j) => (j === i ? { ...x, n } : x)));
                  const sizes = kindSizes(m, e);
                  // No picture here: the kinds grid below shows them, and the sizes need the room.
                  const head = (
                    <span className="nav-label">
                      {nameOf(m.id)}
                      <span className="nav-sub">{sizes ?? "per table"}</span>
                    </span>
                  );
                  return (
                    <div key={m.id} className="row layer" data-testid={`candle-layer-${m.id}`}>
                      {sizes ? (
                        <button
                          type="button"
                          className="layer-open"
                          aria-label={`${nameOf(m.id)} sizes`}
                          onClick={() => open(`candle:${m.id}`)}
                          data-testid={`candle-open-${m.id}`}
                        >
                          {head}
                        </button>
                      ) : (
                        head
                      )}
                      <div className="stepper">
                        <RepeatButton
                          label={`Fewer: ${nameOf(m.id)}`}
                          icon="minus"
                          disabled={m.n <= 1}
                          onStep={() => set(Math.max(1, m.n - 1))}
                        />
                        <output aria-label={`${nameOf(m.id)} per table`}>{m.n}</output>
                        <RepeatButton
                          label={`More: ${nameOf(m.id)}`}
                          icon="plus"
                          disabled={m.n >= MAX_CANDLES_PER_KIND}
                          onStep={() => set(Math.min(MAX_CANDLES_PER_KIND, m.n + 1))}
                        />
                      </div>
                      {sizes && (
                        // A wider target for the chevron; the name before it is the keyboard's way in.
                        <button
                          type="button"
                          className="layer-next"
                          tabIndex={-1}
                          aria-hidden="true"
                          onClick={() => open(`candle:${m.id}`)}
                        >
                          <Icon name="next" size={16} className="nav-chevron" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {total >= 2 && (
              <>
                <h3 className="group-title">Arrangement</h3>
                <div className="list">
                  {varied && (
                    <div className="row">
                      <span className="nav-label">
                        Order
                        <span className="nav-sub">
                          {shown.candleOrder ? "Shuffled" : "Tallest in the middle"}
                        </span>
                      </span>
                      {shown.candleOrder > 0 && (
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => apply({ candleOrder: 0 })}
                          data-testid="candle-order-reset"
                        >
                          Reset
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn small"
                        onClick={shuffle}
                        data-testid="candle-shuffle"
                      >
                        Shuffle
                      </button>
                    </div>
                  )}
                  <SizeStepper
                    label="Rotation"
                    sub="Whole group"
                    value={shown.candleTurn}
                    range={{ min: 0, max: 180, step: 15 }}
                    unit="°"
                    less="Turn back"
                    more="Turn on"
                    onSet={(candleTurn) => apply({ candleTurn })}
                    testId="candle-turn"
                  />
                </div>
                <p className="hint">Line on long tables, ring on round ones.</p>
              </>
            )}
            <h3 className="group-title">
              {mix.length >= MAX_CANDLE_KINDS
                ? `Kinds · ${MAX_CANDLE_KINDS} of ${MAX_CANDLE_KINDS}`
                : `Kinds · choose up to ${MAX_CANDLE_KINDS}`}
            </h3>
            <PickGrid
              label="Candle kinds"
              options={family("candle")}
              isOn={(id) => mix.some((m) => m.id === id)}
              count={(id) => mix.find((m) => m.id === id)?.n}
              onPick={(id) => {
                if (mix.some((m) => m.id === id)) return setMix(mix.filter((m) => m.id !== id));
                if (mix.length >= MAX_CANDLE_KINDS)
                  return editor.notify(`Up to ${MAX_CANDLE_KINDS} kinds per table. Remove one first.`);
                const e = catalog.get(id);
                setMix([...mix, { id, n: e?.defaultCount ?? 1 }]);
              }}
              testId="candles"
            />
            <p className="hint">Lit in evening light.</p>
          </>
        )}
        {view === "centrepiece" && (
          <>
            <PickGrid
              label="Centrepiece"
              none
              options={family("floral").filter((e) => e.placement === "table")}
              isOn={(id) => shown.florals === id}
              onPick={(id) => apply({ florals: id })}
              testId="florals"
            />
            {shown.florals !== "none" && typed && (
              <Chips
                label={`Flowers · ${FLOWER_TYPES[shown.flowerType]?.label ?? ""}`}
                options={Object.entries(FLOWER_TYPES).map(([id, f]) => ({ id, name: f.label }))}
                value={shown.flowerType}
                onPick={(id) => apply({ flowerType: id })}
                testId="flower-type"
                wrap
              />
            )}
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
          </>
        )}
        {view === "chairs" && (
          <PickGrid
            label="Chairs"
            options={family("chair", "chair")}
            nameOf={(e) => e.name.replace(/ chairs?$/i, "")}
            isOn={(id) => shown.chair === id}
            onPick={(id) => apply({ chair: id })}
            testId="chair"
          />
        )}
        {view === "settings" && (
          <>
            {scenario.style.settings && (
              <>
                <Chips
                  label="Chargers"
                  options={CHARGERS}
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
              </>
            )}
            {/* The switches cover every table, whatever is selected: below, as on the Style page. */}
            <h3 className="group-title">Every table</h3>
            <div className="list">
              <Toggle
                label="Place settings"
                checked={scenario.style.settings}
                onChange={(v) => editor.setStyle("settings", v)}
                testId="settings"
              />
              <Toggle
                label="Menu cards"
                checked={scenario.style.menus}
                onChange={(v) => editor.setStyle("menus", v)}
                testId="menus"
              />
            </div>
          </>
        )}
      </div>
    );
  }

  // One kind by name; a mix as a count, so the row stays one line.
  const candleSummary =
    shown.candles.length === 0
      ? "None"
      : shown.candles.length === 1
        ? `${nameOf(shown.candles[0]?.id ?? "")} · ${shown.candles[0]?.n ?? 0}`
        : `${shown.candles.reduce((a, m) => a + m.n, 0)} candles · ${shown.candles.length} kinds`;
  const first = (id: string) => catalog.get(id);
  const row = (key: keyof typeof STYLE_PAGES, value: string, thumb?: LibraryEntry, icon?: IconName) => (
    <NavRow
      label={STYLE_PAGES[key]}
      value={value}
      lead={
        thumb ? (
          <Thumb entry={thumb} />
        ) : icon ? (
          <span className="library-icon" aria-hidden="true">
            <Icon name={icon} />
          </span>
        ) : (
          <span className="library-icon none-icon" aria-hidden="true" />
        )
      }
      onClick={() => open(key)}
      testId={`style-row-${key}`}
    />
  );
  return (
    <div className="panel-body" data-testid="style-panel">
      <PageHead title="Style" />
      {scopeControl}
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
      <div className="list">
        {row("runner", nameOf(shown.runner), first(shown.runner))}
        {row("candles", candleSummary, shown.candles[0] && first(shown.candles[0].id))}
        {row(
          "centrepiece",
          shown.florals === "none"
            ? "None"
            : `${nameOf(shown.florals)} · ${FLORAL_PALETTES[shown.floralColour]?.label ?? ""}`,
          first(shown.florals),
        )}
        {row("chairs", nameOf(shown.chair), first(shown.chair))}
        {row(
          "settings",
          scenario.style.settings
            ? `${shown.charger === "none" ? "No" : (CHARGERS.find((c) => c.id === shown.charger)?.name ?? "")} chargers · ${shown.napkin === "none" ? "no napkins" : nameOf(shown.napkin).toLowerCase()}`
            : "Off",
          scenario.style.settings ? first(shown.napkin) : undefined,
          scenario.style.settings ? "decor" : undefined,
        )}
      </div>
      <h3 className="group-title">Every table</h3>
      <div className="list">
        <div className="row">
          <span className="row-label">Tablecloth</span>
          <div className="seg" role="radiogroup" aria-label="Tablecloth length">
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
      </div>
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
        People are simple neutral figures. Seated first; the rest stand near the bar, never on the dance area
        at dinner. At the party the dance area fills.
      </p>
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
  { key: "UV02", label: "Toward the kitchen", detail: "Dance area side and the stair" },
];

/** Room (VEN-05, LAY-05, LAY-08, LAY-12): views, the restaurant's own furniture and art, the layout rules. */
export function RoomPanel({ open }: { open: (page: "rules" | "paintings" | "graphics") => void }) {
  const { editor, venue } = useStudio();
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  const snapping = useEditor((s) => s.snapping);
  const { front, side } = venue.data.fixtures.venueFurniture.barStools;
  const changed = Object.keys(scenario.venueToggles.paintings).length;
  const t = scenario.thresholds;
  const g = useStore(graphicsStore);
  return (
    <div className="panel-body" data-testid="venue-panel">
      <PageHead title="Room" />
      <h3 className="group-title">Views</h3>
      <div className="view-grid" aria-label="Views">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            className="view-tile"
            title={v.detail}
            onClick={() => {
              editor.setCamera("dollhouse");
              requestAnimationFrame(() => requestCamera(v.key));
            }}
          >
            <span className="view-icon">
              <Icon name="camera" size={18} />
            </span>
            {v.label}
          </button>
        ))}
      </div>
      <h3 className="group-title">Restaurant</h3>
      <div className="list">
        <Toggle
          label="Bar stools"
          sub={`${front} at the front · ${side} on each side`}
          checked={scenario.venueToggles.barStools}
          onChange={(v) => editor.setVenueToggle("barStools", v)}
          testId="toggle-stools"
        />
        <NavRow
          label="Paintings"
          value={changed ? `${changed} changed` : "Current art"}
          onClick={() => open("paintings")}
          testId="room-paintings"
        />
      </div>
      <h3 className="group-title">Layout</h3>
      <div className="list">
        <NavRow
          label="Layout rules"
          sub="When a check appears"
          value={`Aisle ${metres(t.aisleM)} · doors ${metres(t.clearanceM)}`}
          onClick={() => open("rules")}
          testId="room-rules"
        />
        <Toggle label="Snap to 10 cm grid" checked={snapping} onChange={(v) => editor.setSnapping(v)} />
      </div>
      <p className="hint">
        Main restaurant floor only. Room ≈ {venue.width} × {venue.depth} m, estimated from photos; every size
        is approximate.
      </p>
      <h3 className="group-title">This device</h3>
      <div className="list">
        <NavRow
          label="Graphics"
          value={g.choice === "auto" ? `Auto (${TIER_NAMES[g.tier]})` : TIER_NAMES[g.choice]}
          onClick={() => open("graphics")}
          testId="room-graphics"
        />
      </div>
    </div>
  );
}

const TIER_NAMES: Record<TierChoice, string> = {
  auto: "Auto",
  high: "High",
  balanced: "Balanced",
  battery: "Battery saver",
};

/** Room › This device › Graphics (owner-approved mock-up `docs/mockups/graphics.html`). */
export function GraphicsPage({ onBack }: { onBack: () => void }) {
  const g = useStore(graphicsStore);
  const list = useRef<HTMLDivElement>(null);
  // Keyboard: the page opens on its chosen row, and going back returns to the Graphics row.
  useEffect(() => {
    list.current?.querySelector<HTMLInputElement>("input:checked")?.focus({ preventScroll: true });
    return () => {
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[data-testid="room-graphics"]')?.focus(),
      );
    };
  }, []);
  const lines: Record<TierChoice, string> = {
    auto: `Smooth on this device · now ${TIER_NAMES[g.autoTier]}`,
    high: "Sharpest, softest shadows",
    balanced: "Lighter while the view moves",
    battery: "Smoothest on battery · simpler shadows and glow",
  };
  // A choice richer than what Auto settled on here may not keep up.
  const strained = (c: TierChoice) => c !== "auto" && TIERS.indexOf(c) < TIERS.indexOf(g.autoTier);
  return (
    <div className="panel-body" data-testid="graphics">
      <PageHead title="Graphics" back="Room" onBack={onBack} />
      <div className="list" role="radiogroup" aria-label="Graphics" ref={list}>
        {tierChoices(g.phone).map((c) => (
          <label key={c} className="nav-row choice-row" data-testid={`graphics-${c}`}>
            <input
              type="radio"
              name="graphics"
              className="sr-only"
              checked={g.choice === c}
              onChange={() => graphicsStore.setState({ choice: c })}
            />
            <span className="nav-label">
              {TIER_NAMES[c]}
              <span className="nav-sub">{lines[c]}</span>
              {g.choice === c && strained(c) && <span className="nav-sub">May stutter on this device</span>}
            </span>
            {g.choice === c && <Icon name="check" size={20} className="choice-check" />}
          </label>
        ))}
      </div>
      <p className="hint">Saved on this device. Lighting and furniture are the same in every choice.</p>
    </div>
  );
}

/** Room › Paintings (VEN-05): keep, swap or hide each painting. */
export function PaintingsPage({ onBack }: { onBack: () => void }) {
  const { editor, venue } = useStudio();
  const choices = useEditor((s) => s.scenarios[s.activeId]?.venueToggles.paintings ?? {});
  return (
    <div className="panel-body" data-testid="paintings">
      <PageHead title="Paintings" back="Room" onBack={onBack} />
      {venue.data.fixtures.paintings.map((p) => (
        <Swatches
          key={p.id}
          label={p.label}
          options={[
            { id: "current", name: "Current", colour: palette(p.palette) },
            ...ARTWORKS.map((a) => ({ id: a.id, name: a.name, colour: palette(a.palette) })),
            { id: "hidden", name: "Hidden", colour: NONE_SWATCH },
          ]}
          value={choices[p.id] ?? "current"}
          onPick={(id) => editor.setPainting(p.id, id === "current" ? null : id)}
          testId={`painting-${p.id}`}
        />
      ))}
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
        format={unit === "m" ? (v) => `≈ ${metres(v)}` : unit ? (v) => `${v} ${unit}` : undefined}
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

/**
 * What to do with the selection (LAY-02, CAM-04), one tap each: a toolbar beside it on desktop, a row
 * of large buttons at the top of the phone sheet (DESIGN_GUIDE §4).
 */
export function SelectionActions({
  ids,
  locked,
  sitHere,
  onStyle,
  onDetails,
}: {
  ids: string[];
  locked: boolean;
  /** The table to choose a seat at, when the selection is one seated table. */
  sitHere: string | null;
  onStyle?: (() => void) | null;
  onDetails?: () => void;
}) {
  const { editor } = useStudio();
  const action = (icon: IconName, label: string, run: () => void, testId: string, danger = false) => (
    <button type="button" className={`action ${danger ? "danger" : ""}`} onClick={run} data-testid={testId}>
      <Icon name={icon} size={18} />
      <span>{label}</span>
    </button>
  );
  return (
    <div className="actions-bar" role="group" aria-label="Actions">
      {!locked && action("rotateRight", "Rotate", () => editor.rotateItems(ids, -Math.PI / 2), "rotate-90")}
      {!locked && action("copy", "Duplicate", () => editor.duplicateSelection(), "duplicate")}
      {sitHere &&
        action(
          "seat",
          "Sit here",
          () => {
            // The selection clears, so every chair of the table is free to choose.
            editor.select([]);
            viewStore.setState({ pickSeat: sitHere });
          },
          "sit-here",
        )}
      {onStyle && action("decor", "Style", onStyle, "style-selection")}
      {onDetails && action("sliders", "Details", onDetails, "details")}
      {action("trash", "Delete", () => editor.deleteSelection(), "delete", true)}
    </div>
  );
}

/**
 * The selection's details (LAY-02, LAY-03, CAM-04, REQ-01). Desktop: a page inside the current
 * section, opened from the selection toolbar, with a way back (DESIGN_GUIDE §3.1). Phone: the sheet
 * for the selection, its actions first so the peek height shows them (§3.2).
 */
export function Inspector({
  back,
  phone,
  onStyle,
}: {
  back?: { label: string; onBack: () => void };
  phone: boolean;
  onStyle: () => void;
}) {
  const { editor, catalog, venue } = useStudio();
  const selection = useEditor((s) => s.selection);
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
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

  const mine = advisories.filter((a) => a.items.some((id) => ids.includes(id)));

  const title =
    items.length === 2 && items[0] && items[1]
      ? `${itemTitle(items[0], labels, catalog)} and ${itemTitle(items[1], labels, catalog).replace(/^Table /, "table ")}`
      : many
        ? `${items.length} items`
        : itemTitle(item, labels, catalog);
  const seated = !many && "seats" in shape && shape.seats > 0;
  return (
    <div className="panel-body" data-testid="inspector">
      <PageHead
        title={
          <>
            {title}
            {phone && seated && (
              <span className="title-sub"> · {"seats" in shape ? shape.seats : 0} seats</span>
            )}{" "}
            {!many && entry && <ResultBadge entry={entry} />}
          </>
        }
        back={back?.label}
        onBack={back?.onBack}
        action={
          <button type="button" className="plain-btn" onClick={() => editor.select([])}>
            Done
          </button>
        }
      />
      {phone && (
        <SelectionActions
          ids={ids}
          locked={locked}
          sitHere={seated ? item.id : null}
          onStyle={isTable(item, catalog) ? onStyle : null}
        />
      )}
      {!locked && (
        <div className="row">
          <span className="row-label">Turn</span>
          <span className="rotate-group" role="group" aria-label="Turn (clockwise is +)">
            <button type="button" className="btn" onClick={() => editor.rotateItems(ids, ROTATE_STEP)}>
              −15°
            </button>
            <button type="button" className="btn" onClick={() => editor.rotateItems(ids, -ROTATE_STEP)}>
              +15°
            </button>
          </span>
        </div>
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
      {!phone && isTable(item, catalog) && (
        <div className="list">
          <NavRow label="Style this table" onClick={onStyle} testId="style-table" />
        </div>
      )}
      {!many && entry && (
        <button
          type="button"
          className="plain-btn inspector-foot"
          onClick={() => {
            // The form opens in Add › Yours, where requests are listed (REQ-01).
            editor.select([]);
            viewStore.setState({ requestFor: entry.id });
          }}
          data-testid="inspector-request"
        >
          Request a custom model
        </button>
      )}
    </div>
  );
}
