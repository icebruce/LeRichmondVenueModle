import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { type Vec2, pointInPolygon } from "../domain/geometry";
import { tableLabels } from "../domain/layout/counts";
import { type Seat, fullName, layoutSeats, seatedNames, unseated } from "../domain/layout/seating";
import type { GuestName, Scenario } from "../domain/scenario/schema";
import { cameraCommands } from "../state/view";
import { useEditor, useStudio, useView } from "../scene/context";
import { useBackLayer } from "./back";
import { Icon } from "./icons";
import { type SeatSpot, drawRoom, seatingStretch } from "./plan";
import { useServices } from "./services";

type View = { zoom: number; x: number; y: number };
const FIT: View = { zoom: 1, x: 0, y: 0 };
const ZOOM_MAX = 4;
/** The desktop table card's width with its margin (studio.css .seating-card). */
const CARD_W = 360;

/**
 * Seating (SEA-01..04): the room as the seating chart prints it, in place of the 3D view. Tap a seat
 * or a table to name its guests; move a guest to another seat; export the chart for the venue.
 */
export function SeatingLayer({ phone }: { phone: boolean }) {
  const { editor, venue, catalog } = useStudio();
  const services = useServices();
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  const insetTop = useView((s) => s.insetTop);
  const insetBottom = useView((s) => s.insetBottom);
  const insetRight = useView((s) => s.insetRight);
  const insetColumn = useView((s) => s.insetColumn);
  const [table, setTable] = useState<string | null>(null);
  const [seat, setSeat] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [view, setView] = useState<View>(FIT);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const seats = useMemo(() => layoutSeats(scenario.items, catalog), [scenario.items, catalog]);
  const lost = unseated(scenario, seats);
  const named = seatedNames(scenario, seats);
  const movingName = moving ? scenario.seating[moving] : undefined;
  // A table deleted while its card is open closes the card.
  const shownTable = table && seats.some((s) => s.item === table) ? table : null;

  useBackLayer(phone && !!shownTable, () => setTable(null));
  useBackLayer(phone && !!moving, () => setMoving(null));
  useBackLayer(phone && listOpen, () => setListOpen(false));

  // Reset view fits the room again.
  useEffect(
    () =>
      cameraCommands.subscribe((s, prev) => {
        if (s.request.n !== prev.request.n && s.request.key === null) setView(FIT);
      }),
    [],
  );

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The room drawn to fit the free area (below the toolbar, above the bar), then zoomed and panned.
  const cardOpen = !!table && !moving;
  const frame = useMemo(() => {
    const m = 16;
    // Phone: the full width below the control column; desktop: below the toolbar, above the bar.
    const top = (phone ? Math.max(60, insetColumn) : insetTop) + m;
    const bottom = (phone ? 0 : 76) + m;
    // Desktop: the table's card stands at the right; the room moves over beside it.
    const right = !phone && cardOpen ? CARD_W + m : 0;
    return { x: m, y: top, w: Math.max(1, size.w - 2 * m - right), h: Math.max(1, size.h - top - bottom) };
  }, [size, insetTop, insetColumn, phone, cardOpen]);

  // Drawn off screen with where its seats and tables are, then shown.
  const stretch = useMemo(() => seatingStretch(venue), [venue]);
  const rendered = useMemo(() => {
    if (!size.w || !size.h) return null;
    const dpr = window.devicePixelRatio || 1;
    const c = document.createElement("canvas");
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const g = c.getContext("2d");
    if (!g) return null;
    g.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, dpr * view.x, dpr * view.y);
    const hits = drawRoom(g, scenario, venue, catalog, frame, {
      seating: true,
      stretch,
      focusSeat: moving ?? seat,
      focusTable: shownTable,
    });
    return { c, hits };
  }, [scenario, venue, catalog, frame, size, view, seat, shownTable, moving, stretch]);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !rendered) return;
    c.width = rendered.c.width;
    c.height = rendered.c.height;
    c.getContext("2d")?.drawImage(rendered.c, 0, 0);
  }, [rendered]);

  // Taps name seats; drags pan; wheel and pinch zoom.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; dist: number } | null>(null);
  const zoomAt = (x: number, y: number, by: number) =>
    setView((v) => {
      const zoom = Math.min(ZOOM_MAX, Math.max(1, v.zoom * by));
      const f = zoom / v.zoom;
      return zoom === 1 ? FIT : { zoom, x: x - (x - v.x) * f, y: y - (y - v.y) * f };
    });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const labels = tableLabels(scenario.items, catalog);
  /** A seat chosen (tap, click or keyboard): named in its table's card, or the moving guest's new seat. */
  const choose = (spot: SeatSpot) => {
    if (moving) {
      const who = scenario.seating[moving];
      editor.moveSeatName(moving, spot.key);
      if (who) editor.notify(`${fullName(who)} moved`);
      setMoving(null);
    }
    setTable(spot.item);
    setSeat(spot.key);
  };
  /** A tap off the seats: a table opens its card; elsewhere closes it (or stops a move). */
  const tap = (x: number, y: number) => {
    if (moving) {
      setMoving(null);
      return;
    }
    const r: Vec2 = [(x - view.x) / view.zoom, (y - view.y) / view.zoom];
    const t = rendered?.hits.tables.find((t) => pointInPolygon(r, t.poly));
    setTable(t ? t.id : null);
    setSeat(null);
  };

  return (
    <>
      <div
        className="seating-view"
        ref={box}
        style={phone ? { bottom: insetBottom } : undefined}
        onPointerDown={(e) => {
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const p = [...pointers.current.values()];
          gesture.current = {
            moved: pointers.current.size > 1,
            dist: p.length > 1 && p[0] && p[1] ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0,
          };
        }}
        onPointerMove={(e) => {
          const last = pointers.current.get(e.pointerId);
          const g = gesture.current;
          if (!last || !g) return;
          const dx = e.clientX - last.x;
          const dy = e.clientY - last.y;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const p = [...pointers.current.values()];
          if (p.length > 1 && p[0] && p[1]) {
            const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
            const r = e.currentTarget.getBoundingClientRect();
            if (g.dist) zoomAt((p[0].x + p[1].x) / 2 - r.left, (p[0].y + p[1].y) / 2 - r.top, dist / g.dist);
            g.dist = dist;
            g.moved = true;
            return;
          }
          if (!g.moved && Math.hypot(dx, dy) < 1) return;
          if (!g.moved && Math.abs(dx) + Math.abs(dy) > 3) {
            // A drag, not a tap: the view keeps the pointer, even over a seat.
            g.moved = true;
            e.currentTarget.setPointerCapture(e.pointerId);
          }
          if (g.moved) setView((v) => (v.zoom === 1 ? v : { ...v, x: v.x + dx, y: v.y + dy }));
        }}
        onPointerUp={(e) => {
          const g = gesture.current;
          pointers.current.delete(e.pointerId);
          if (pointers.current.size) return;
          gesture.current = null;
          // Seats are buttons and answer their own taps.
          if (g && !g.moved && !(e.target instanceof Element && e.target.closest(".seat-hit"))) {
            const r = e.currentTarget.getBoundingClientRect();
            tap(e.clientX - r.left, e.clientY - r.top);
          }
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          gesture.current = null;
        }}
        data-testid="seating-view"
      >
        <canvas ref={canvas} aria-hidden="true" />
        {rendered?.hits.seats.map((s) => {
          const guest = scenario.seating[s.key];
          const where = `Table ${labels.get(s.item) ?? ""}, seat ${s.key.split(":").pop() ?? ""}`;
          return (
            <button
              key={s.key}
              type="button"
              className="seat-hit"
              style={{
                left: view.x + s.x * view.zoom,
                top: view.y + s.y * view.zoom,
                width: s.w * view.zoom,
                height: s.h * view.zoom,
              }}
              aria-label={`${where}: ${guest ? fullName(guest) : "empty"}`}
              onClick={() => choose(s)}
              data-testid={`seat-${s.key}`}
            />
          );
        })}
      </div>

      {movingName ? (
        <div
          className="seating-bar glass"
          style={phone ? { right: insetRight + 12 } : undefined}
          role="status"
          data-testid="seating-moving"
        >
          <span className="seating-count">Choose a seat for {fullName(movingName)}</span>
          <button type="button" className="plain-btn" onClick={() => setMoving(null)}>
            Cancel
          </button>
        </div>
      ) : (
        <div
          className="seating-bar glass"
          style={phone ? { right: insetRight + 12 } : undefined}
          data-testid="seating-bar"
        >
          <span className="seating-count">
            <b>{named}</b> of {seats.length} seats named
          </span>
          {lost.length > 0 && (
            <button
              type="button"
              className="plain-btn"
              onClick={() => setListOpen((o) => !o)}
              aria-expanded={listOpen}
              data-testid="seating-unseated"
            >
              {lost.length} without a seat
            </button>
          )}
          {!phone && (
            <span className="seating-zoom">
              <button
                type="button"
                className="icon-btn"
                onClick={() => zoomAt(size.w / 2, size.h / 2, 1 / 1.5)}
                disabled={view.zoom <= 1}
                aria-label="Zoom out"
                title="Zoom out"
              >
                <Icon name="minus" />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => zoomAt(size.w / 2, size.h / 2, 1.5)}
                disabled={view.zoom >= ZOOM_MAX}
                aria-label="Zoom in"
                title="Zoom in"
                data-testid="seating-zoom-in"
              >
                <Icon name="plus" />
              </button>
            </span>
          )}
          <button
            type="button"
            className="btn primary"
            onClick={() => void services.exportPlan("pdf", "seating")}
            data-testid="seating-export"
          >
            <Icon name="download" />
            {phone ? "PDF" : "Export PDF"}
          </button>
        </div>
      )}

      {listOpen && lost.length > 0 && (
        <div className="seating-pop" role="dialog" aria-label="Guests without a seat">
          <div className="seating-card-head">
            <h2 className="panel-title">Without a seat</h2>
            <button type="button" className="icon-btn" onClick={() => setListOpen(false)} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>
          <p className="hint">Their table was removed or lost seats. Place them again or remove them.</p>
          <ul className="seating-rows">
            {lost.map(({ key, name }) => (
              <li key={key} className="seating-lost">
                <span>{fullName(name)}</span>
                <button
                  type="button"
                  className="plain-btn"
                  onClick={() => {
                    setMoving(key);
                    setListOpen(false);
                  }}
                >
                  Place
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${fullName(name)}`}
                  onClick={() => editor.removeSeatName(key)}
                >
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {shownTable && !moving && (
        <TableCard
          key={shownTable}
          item={shownTable}
          seats={seats.filter((s) => s.item === shownTable)}
          label={labels.get(shownTable) ?? ""}
          names={scenario.seating}
          focus={seat}
          phone={phone}
          onFocus={setSeat}
          onSave={(key, name) => editor.setSeatName(key, name)}
          onMove={(key) => setMoving(key)}
          onClose={() => {
            setTable(null);
            setSeat(null);
          }}
        />
      )}
    </>
  );
}

/** One table's seats as first and last name fields, in seat order (SEA-01). */
function TableCard(props: {
  item: string;
  seats: Seat[];
  label: string;
  names: Scenario["seating"];
  focus: string | null;
  phone: boolean;
  onFocus: (key: string) => void;
  onSave: (key: string, name: GuestName) => void;
  onMove: (key: string) => void;
  onClose: () => void;
}) {
  const { seats, names, focus } = props;
  const list = useRef<HTMLOListElement>(null);
  const filled = seats.filter((s) => names[s.key]).length;
  const title = props.label === "♥" ? "Sweetheart table" : `Table ${props.label}`;
  // The tapped seat's first name takes the cursor.
  useEffect(() => {
    if (!focus) return;
    const input = list.current?.querySelector<HTMLInputElement>(`[data-first="${focus}"]`);
    if (input && document.activeElement?.closest("li")?.getAttribute("data-seat") !== focus) input.focus();
  }, [focus]);
  const next = (key: string) => {
    const i = seats.findIndex((s) => s.key === key);
    const to = seats[i + 1];
    if (to) list.current?.querySelector<HTMLInputElement>(`[data-first="${to.key}"]`)?.focus();
    else (document.activeElement as HTMLElement | null)?.blur();
  };
  return (
    <div
      className={`seating-card${props.phone ? " phone" : ""}`}
      role="dialog"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === "Escape") props.onClose();
      }}
      data-testid="seating-card"
    >
      <div className="seating-card-head">
        <div>
          <h2 className="panel-title">{title}</h2>
          <p className="hint">
            {filled} of {seats.length} named
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={props.onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <ol className="seating-rows" ref={list}>
        {seats.map((s) => (
          <SeatRow
            key={s.key}
            seat={s}
            name={names[s.key]}
            active={focus === s.key}
            onFocus={() => props.onFocus(s.key)}
            onSave={(n) => props.onSave(s.key, n)}
            onNext={() => next(s.key)}
            onMove={() => props.onMove(s.key)}
          />
        ))}
      </ol>
    </div>
  );
}

function SeatRow(props: {
  seat: Seat;
  name: GuestName | undefined;
  active: boolean;
  onFocus: () => void;
  onSave: (name: GuestName) => void;
  onNext: () => void;
  onMove: () => void;
}) {
  const [first, setFirst] = useState(props.name?.first ?? "");
  const [last, setLast] = useState(props.name?.last ?? "");
  // Undo, a move or the partner's change shows in the fields.
  const stored = `${props.name?.first ?? ""}\n${props.name?.last ?? ""}`;
  const [seen, setSeen] = useState(stored);
  if (seen !== stored) {
    setSeen(stored);
    setFirst(props.name?.first ?? "");
    setLast(props.name?.last ?? "");
  }
  const save = () => {
    if (first.trim() !== (props.name?.first ?? "") || last.trim() !== (props.name?.last ?? ""))
      props.onSave({ first, last });
  };
  const keys = (e: KeyboardEvent<HTMLInputElement>, isLast: boolean) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (isLast) {
      save();
      props.onNext();
    } else e.currentTarget.parentElement?.querySelector<HTMLInputElement>("[data-last]")?.focus();
  };
  const n = props.seat.n;
  return (
    <li className={`seating-row${props.active ? " on" : ""}`} data-seat={props.seat.key}>
      <span className="seating-n" aria-hidden="true">
        {n}
      </span>
      <input
        value={first}
        onChange={(e) => setFirst(e.target.value)}
        onFocus={props.onFocus}
        onBlur={save}
        onKeyDown={(e) => keys(e, false)}
        placeholder="First name"
        aria-label={`Seat ${n}, first name`}
        maxLength={40}
        autoComplete="off"
        data-first={props.seat.key}
      />
      <input
        value={last}
        onChange={(e) => setLast(e.target.value)}
        onFocus={props.onFocus}
        onBlur={save}
        onKeyDown={(e) => keys(e, true)}
        placeholder="Last name"
        aria-label={`Seat ${n}, last name`}
        maxLength={40}
        autoComplete="off"
        data-last
      />
      <button
        type="button"
        className="icon-btn"
        onClick={props.onMove}
        disabled={!props.name}
        aria-label={`Move the guest on seat ${n}`}
        title="Move to another seat"
      >
        <Icon name="swap" />
      </button>
    </li>
  );
}
