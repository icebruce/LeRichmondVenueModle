import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  IMPORT_TYPES,
  RESULT_LABELS,
  importKind,
  importAdjusts,
  importParams,
  requestStatus,
  suggest,
} from "../domain/library/imported";
import {
  type CustomRequest,
  type ImportType,
  type Imported,
  type LibraryEntry,
  customRequestSchema,
  importedSchema,
} from "../domain/library/schema";
import { styleKeyOf, stylePatch } from "../domain/layout/decor";
import { isTable } from "../domain/layout/items";
import { libraryStore } from "../state/library";
import { viewStore } from "../state/view";
import { useEditor, useStudio, useView } from "../scene/context";
import { Chips, ResultBadge, Thumb, useTopOnChange } from "./Panels";
import { type Crop, useServices } from "./services";
import { Icon } from "./icons";

type Mode =
  | { k: "list" }
  | { k: "add" }
  | { k: "item"; id: string }
  | { k: "request"; request: CustomRequest; isNew: boolean };

/**
 * Inspiration (IMP-01..07, REQ-01..02): photos become library items, honestly labelled, and any
 * item can become a request for a custom model that Claude builds.
 */
export function InspirationPanel({ head, onAdded }: { head: ReactNode; onAdded: () => void }) {
  const { catalog, editor } = useStudio();
  const { library, cloud } = useServices();
  const imports = useStore(libraryStore, (s) => s.imports);
  const requests = useStore(libraryStore, (s) => s.requests);
  const requestFor = useView((s) => s.requestFor);
  const [mode, setMode] = useState<Mode>({ k: "list" });

  // "Request a custom model" from the inspector opens the form here.
  const fromInspector = useMemo(() => {
    const e = requestFor ? catalog.get(requestFor) : undefined;
    return e ? newRequest(e, libraryStore.getState().imports, library.newId(), cloud.partner) : null;
  }, [requestFor, catalog, library, cloud.partner]);
  useTopOnChange(
    fromInspector?.id ?? (mode.k === "item" ? mode.id : mode.k === "request" ? mode.request.id : mode.k),
  );
  if (fromInspector)
    return (
      <RequestForm
        key={fromInspector.id}
        initial={fromInspector}
        isNew
        onDone={() => viewStore.setState({ requestFor: null })}
        onAdded={onAdded}
      />
    );

  if (mode.k === "add")
    return <AddInspiration onDone={(id) => setMode(id ? { k: "item", id } : { k: "list" })} />;
  if (mode.k === "item")
    return (
      <ItemDetail
        id={mode.id}
        onBack={() => setMode({ k: "list" })}
        onRequest={(r) => setMode({ k: "request", request: r, isNew: true })}
      />
    );
  if (mode.k === "request")
    return (
      <RequestForm
        initial={mode.request}
        isNew={mode.isNew}
        onDone={() => setMode({ k: "list" })}
        onAdded={onAdded}
      />
    );

  const shown = imports.filter((i) => !i.archived);
  const status = requests.map((r) => ({ r, ...requestStatus(r, catalog) }));
  const ready = status.filter((x): x is typeof x & { entry: LibraryEntry } => !!x.entry);
  const waiting = status.filter((x) => !x.entry);
  const use = (e: LibraryEntry) => {
    if (editor.placeOrUse(e.id, viewStore.getState().focus) === "placed") onAdded();
  };
  return (
    <div className="panel-body" data-testid="inspiration-panel">
      {head}
      <button
        type="button"
        className="btn primary"
        onClick={() => setMode({ k: "add" })}
        data-testid="add-inspiration"
      >
        <Icon name="camera" size={16} /> Add from a photo
      </button>
      {ready.length > 0 && (
        <>
          <h3 className="group-title">Ready</h3>
          <div className="list" aria-label="Ready">
            {ready.map(({ r, entry }) => (
              <div key={r.id} className="row">
                <Thumb entry={entry} />
                <span className="nav-label">
                  {entry.name}
                  <span className="nav-sub">
                    Your custom model · <span className="ok-text">ready</span>
                  </span>
                </span>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => use(entry)}
                  data-testid={`ready-${r.id}`}
                >
                  {styleKeyOf(entry) ? "Use on tables" : "Place"}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <h3 className="group-title">Your items</h3>
      {shown.length ? (
        <div className="list" aria-label="Your items">
          {shown.map((i) => {
            const e = catalog.get(i.id);
            return (
              e && (
                <button
                  key={i.id}
                  type="button"
                  className="nav-row"
                  onClick={() => setMode({ k: "item", id: i.id })}
                  data-testid={`imported-${i.id}`}
                >
                  <Thumb entry={e} />
                  <span className="nav-label">
                    {e.name}
                    <span className="nav-sub">
                      <ResultBadge entry={e} /> {importKind(i.type).name}
                    </span>
                  </span>
                  <Icon name="next" size={16} className="nav-chevron" />
                </button>
              )
            );
          })}
        </div>
      ) : (
        <p className="hint">Photos you add become items you can place or use on every table.</p>
      )}
      {waiting.length > 0 && (
        <>
          <h3 className="group-title">Requests</h3>
          <div className="list" aria-label="Requests">
            {waiting.map(({ r, label }) => (
              <button
                key={r.id}
                type="button"
                className="nav-row"
                onClick={() => setMode({ k: "request", request: r, isNew: false })}
                data-testid={`request-${r.id}`}
              >
                <span className="nav-label">
                  {r.name}
                  <span className="nav-sub">
                    Sent{" "}
                    {new Date(r.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })} ·
                    shows under Ready when built
                  </span>
                </span>
                <span className="badge">{label}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <button
        type="button"
        className="more"
        onClick={() =>
          setMode({
            k: "request",
            request: newRequest(null, imports, library.newId(), cloud.partner),
            isNew: true,
          })
        }
        data-testid="request-new"
      >
        <Icon name="plus" size={18} />
        <span className="nav-label">
          Request a custom model
          <span className="nav-sub">Photos, real size and notes. Claude builds it.</span>
        </span>
        <Icon name="next" size={16} className="nav-chevron" />
      </button>
    </div>
  );
}

/**
 * A new request, from a library or imported item (its name, size, placement and photo), or from
 * scratch (`e` null): nothing filled in, so the form asks for a name and a size (REQ-01, LIB-13).
 */
function newRequest(
  e: LibraryEntry | null,
  imports: readonly Imported[],
  id: string,
  partner: "A" | "B" | null,
): CustomRequest {
  const imp = e && imports.find((i) => i.id === e.id);
  const now = new Date().toISOString();
  const cm = (m: number) => Math.max(1, Math.round(m * 100));
  return {
    id: `req-${id}`,
    ...(e ? { itemId: e.id } : {}),
    name: e?.name ?? "",
    sizeCm: imp
      ? { w: imp.sizeCm.w, h: imp.sizeCm.h }
      : e
        ? { w: cm(e.sizeM.w), d: cm(e.sizeM.d), h: cm(Math.max(e.sizeM.h, 0.01)) }
        : { w: 0, h: 0 },
    placement: !e || e.placement === "material" ? "table" : e.placement,
    notes: "",
    imageIds: imp ? [imp.imageId] : [],
    createdAt: now,
    updatedAt: now,
    createdBy: partner,
  };
}

// ---- Adding a photo -----------------------------------------------------------------------------

type Draft = {
  file: ImageBitmap | null;
  preview: string | null;
  link: string;
  type: ImportType | null;
  crop: Crop;
  w: string;
  h: string;
};

const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 };
/** The first crop sits a little inside the photo, so the frame and its dimmed surround show at once. */
const START: Crop = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 };

function AddInspiration({ onDone }: { onDone: (id: string | null) => void }) {
  const { catalog, editor } = useStudio();
  const { library, cloud } = useServices();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>({
    file: null,
    preview: null,
    link: "",
    type: null,
    crop: START,
    w: "",
    h: "",
  });
  const [error, setError] = useState<string | null>(null);
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const take = async (file: Blob | null | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const bitmap = await library.decode(file);
      if (draft.preview) URL.revokeObjectURL(draft.preview);
      patch({ file: bitmap, preview: URL.createObjectURL(file), crop: START });
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file isn't a photo.");
    }
  };
  // Desktop: a pasted screenshot works anywhere while this step is open (IMP-01).
  useEffect(() => {
    if (step !== 1) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      if (item) void take(item.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });
  useEffect(() => () => void (draft.preview && URL.revokeObjectURL(draft.preview)), [draft.preview]);
  // A phone photo decoded at full size is large: free it once replaced or the wizard closes.
  useEffect(() => () => draft.file?.close(), [draft.file]);

  const back = () => (step === 1 ? onDone(null) : setStep(step - 1));
  return (
    <div className="panel-body" data-testid="add-inspiration-panel">
      <div className="panel-head sticky-head">
        <button type="button" className="plain-btn" onClick={back} data-testid="import-back">
          <Icon name="back" size={16} /> {step === 1 ? "Cancel" : "Back"}
        </button>
        <span className="hint">Step {step} of 4</span>
      </div>
      {step === 1 && <PhotoStep draft={draft} patch={patch} take={take} error={error} />}
      {step === 2 && draft.preview && (
        <>
          <h2 className="panel-title">What is it?</h2>
          <Chips
            label="Choose one"
            options={IMPORT_TYPES.map((k) => ({ id: k.id, name: k.name }))}
            value={draft.type ?? ""}
            onPick={(id) => patch({ type: id as ImportType })}
            testId="import-type"
            wrap
          />
          <img className="import-photo" src={draft.preview} alt="Your photo" />
          <div className="sticky-actions">
            <button
              type="button"
              className="btn primary"
              disabled={!draft.type}
              onClick={() => setStep(3)}
              data-testid="import-next"
            >
              Next
            </button>
          </div>
        </>
      )}
      {step === 3 && draft.preview && draft.type && (
        <CropStep draft={draft} patch={patch} next={() => setStep(4)} catalog={catalog} />
      )}
      {step === 4 && draft.file && draft.type && (
        <ResultStep
          draft={draft}
          onSave={async (item, blob, add) => {
            await library.addImport(item, blob);
            if (add && catalog.has(item.id)) editor.placeOrUse(item.id, viewStore.getState().focus);
            else editor.notify(`“${item.name}” is in your library`);
            onDone(item.id);
          }}
          newId={library.newId}
          partner={cloud.partner}
        />
      )}
    </div>
  );
}

function PhotoStep({
  draft,
  patch,
  take,
  error,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  take: (f: Blob | null | undefined) => Promise<void>;
  error: string | null;
}) {
  const [over, setOver] = useState(false);
  return (
    <>
      <h2 className="panel-title">Add inspiration</h2>
      <label className="btn primary file-btn camera-only">
        <Icon name="camera" size={16} /> Take a photo
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => void take(e.currentTarget.files?.[0])}
        />
      </label>
      <label className="btn file-btn primary-on-desktop">
        <Icon name="upload" size={16} /> Choose a photo
        <input
          type="file"
          accept="image/*"
          onChange={(e) => void take(e.currentTarget.files?.[0])}
          data-testid="photo-file"
        />
      </label>
      <div
        className={`photo-drop ${over ? "over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take([...e.dataTransfer.files].find((f) => f.type.startsWith("image/")));
        }}
      >
        Or drag a photo here, or paste a screenshot.
      </div>
      <label className="field">
        <span className="row-label">Product link (saved as the source)</span>
        <input
          className="text-input wide"
          type="url"
          inputMode="url"
          placeholder="https://…"
          value={draft.link}
          maxLength={500}
          onChange={(e) => patch({ link: e.currentTarget.value })}
          data-testid="import-link"
        />
        <span className="hint">The app never opens it.</span>
      </label>
      {error && (
        <p className="hint error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/** Crop to the object by dragging the frame or its corners (IMP-03), then its real size (IMP-04). */
function CropStep({
  draft,
  patch,
  next,
  catalog,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  next: () => void;
  catalog: ReadonlyMap<string, LibraryEntry>;
}) {
  const area = useRef<HTMLDivElement>(null);
  const aspect = draft.file ? (draft.crop.h * draft.file.height) / (draft.crop.w * draft.file.width) : 1;
  // A starting size: a typical width for this kind of thing, and the crop's height to match.
  const typical = useMemo(() => {
    const fits = [...catalog.values()].filter(
      (e) => !e.imported && importKind(draft.type ?? "other").fits(e),
    );
    const ws = fits.map((e) => e.sizeM.w).sort((a, b) => a - b);
    return Math.round((ws[Math.floor(ws.length / 2)] ?? 0.5) * 100);
  }, [catalog, draft.type]);
  useEffect(() => {
    if (!draft.w) patch({ w: String(typical), h: String(Math.round(typical * aspect)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drag = (kind: "move" | "nw" | "ne" | "sw" | "se") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const box = area.current?.getBoundingClientRect();
    if (!box) return;
    const start = { x: e.clientX, y: e.clientY, crop: draft.crop };
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const MIN = 0.08;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / box.width;
      const dy = (ev.clientY - start.y) / box.height;
      const c = start.crop;
      let { x, y, w, h } = c;
      if (kind === "move") {
        x = clamp(c.x + dx, 0, 1 - c.w);
        y = clamp(c.y + dy, 0, 1 - c.h);
      } else {
        if (kind.includes("w")) {
          x = clamp(c.x + dx, 0, c.x + c.w - MIN);
          w = c.x + c.w - x;
        } else w = clamp(c.w + dx, MIN, 1 - c.x);
        if (kind.includes("n")) {
          y = clamp(c.y + dy, 0, c.y + c.h - MIN);
          h = c.y + c.h - y;
        } else h = clamp(c.h + dy, MIN, 1 - c.y);
      }
      patch({ crop: { x, y, w, h } });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const c = draft.crop;
  const at = { left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` };
  // Keyboard (DESIGN_GUIDE §10): arrows move the frame by 2 %; with Shift they resize it.
  const keys = (e: React.KeyboardEvent) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const [mx = 0, my = 0] = d;
    const [dx, dy] = [mx * 0.02, my * 0.02];
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    patch({
      crop: e.shiftKey
        ? { ...c, w: clamp(c.w + dx, 0.08, 1 - c.x), h: clamp(c.h + dy, 0.08, 1 - c.y) }
        : { ...c, x: clamp(c.x + dx, 0, 1 - c.w), y: clamp(c.y + dy, 0, 1 - c.h) },
    });
  };
  const valid = Number(draft.w) >= 1 && Number(draft.h) >= 1;
  return (
    <>
      <h2 className="panel-title">Crop and size</h2>
      {/* The dimmed surround is clipped to the photo; the frame and its handles sit on a layer above it. */}
      <div className="crop-area">
        <div className="crop-photo">
          <img src={draft.preview ?? ""} alt="Your photo" draggable={false} />
          <div className="crop-dim" style={at} />
        </div>
        <div className="crop-layer" ref={area}>
          <div
            className="crop-box"
            style={at}
            onPointerDown={drag("move")}
            onKeyDown={keys}
            tabIndex={0}
            role="group"
            aria-label="Crop frame. Arrow keys move it; Shift and arrow keys resize it."
            data-testid="crop-box"
          >
            {(["nw", "ne", "sw", "se"] as const).map((k) => (
              <span key={k} className={`crop-handle ${k}`} onPointerDown={drag(k)} aria-hidden="true" />
            ))}
          </div>
        </div>
      </div>
      <p className="hint">Drag the frame or its corners so it holds just the object.</p>
      <div className="size-row">
        <label className="field">
          <span className="row-label">Width (cm)</span>
          <input
            className="text-input"
            type="number"
            inputMode="numeric"
            min={1}
            max={2000}
            value={draft.w}
            onChange={(e) => patch({ w: e.currentTarget.value })}
            data-testid="import-width"
          />
        </label>
        <label className="field">
          <span className="row-label">Height (cm)</span>
          <input
            className="text-input"
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            value={draft.h}
            onChange={(e) => patch({ h: e.currentTarget.value })}
            data-testid="import-height"
          />
        </label>
      </div>
      <p className="hint">Real size, measured or from the product page. Sizes are approximate.</p>
      <div className="sticky-actions">
        <button
          type="button"
          className="btn primary"
          disabled={!valid}
          onClick={next}
          data-testid="import-next"
        >
          Next
        </button>
      </div>
    </>
  );
}

function ResultStep({
  draft,
  onSave,
  newId,
  partner,
}: {
  draft: Draft;
  /** Saves, then (`add`) uses it on every table or places it in the room, or only saves. */
  onSave: (item: Imported, blob: Blob, add: boolean) => Promise<void>;
  newId: () => string;
  partner: "A" | "B" | null;
}) {
  const { catalog } = useStudio();
  const { library } = useServices();
  const [prepared, setPrepared] = useState<Awaited<ReturnType<typeof library.prepare>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [baseId, setBaseId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const type = draft.type as ImportType;
  const kind = importKind(type);
  const sizeCm = { w: Number(draft.w), h: Number(draft.h) };
  useEffect(() => {
    let live = true;
    if (draft.file)
      library
        .prepare(draft.file, draft.crop)
        .then((p) => live && setPrepared(p))
        .catch(
          (e: unknown) => live && setError(e instanceof Error ? e.message : "That photo could not be read."),
        );
    return () => {
      live = false;
    };
  }, [draft.file, draft.crop, library]);
  const options = useMemo(
    () => (prepared ? suggest(type, { sizeCm, colours: prepared.colours }, catalog) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prepared, type, catalog, draft.w, draft.h],
  );
  const base = catalog.get(baseId ?? "") ?? options[0];
  if (error)
    return (
      <p className="hint error" role="alert">
        {error}
      </p>
    );
  if (!prepared || !base) return <p className="hint">Reading your photo…</p>;

  const link = draft.link.trim();
  const save = async (add: boolean) => {
    const imageId = `img-${newId()}`;
    const item: Imported = {
      id: `imp-${newId()}`,
      name: (name.trim() || defaultName(base, kind.result)).slice(0, 60),
      type,
      result: kind.result,
      baseId: base.id,
      params: importParams(base, { sizeCm, colours: prepared.colours, imageId }),
      sizeCm,
      colours: prepared.colours,
      imageId,
      thumb: prepared.thumb,
      ...(link ? { link } : {}),
      createdAt: new Date().toISOString(),
      createdBy: partner,
      archived: false,
    };
    const ok = importedSchema.safeParse(item);
    if (!ok.success) {
      setError(
        link
          ? "That product link isn't a web address (https://…)."
          : "Something about this item isn't valid.",
      );
      return;
    }
    setBusy(true);
    await onSave(ok.data, prepared.blob, add);
  };
  // Say exactly what the photo changed: size, colours, both or neither (DESIGN_GUIDE §1.6).
  const adj = importAdjusts(
    base,
    importParams(base, { sizeCm, colours: prepared.colours, imageId: "img-preview" }),
  );
  const model = `the “${base.name}” model`;
  const what =
    kind.result === "material"
      ? "Your fabric's colour, for tablecloths, runners or napkins."
      : kind.result === "photo"
        ? "Your photo, standing at its real size. It is a picture, not a 3D model."
        : type === "print"
          ? "Your photo in a frame on an easel, at its real size."
          : adj.size && adj.colour
            ? `Built from ${model}, at your size and coloured from your photo. The shape is close, not exact.`
            : adj.size
              ? `Built from ${model} at your size. Its colours stay the model's own.`
              : adj.colour
                ? `Built from ${model}, coloured from your photo. Its size stays the model's; yours is kept for reference.`
                : `Uses ${model} as it is; your size and photo are kept for reference.`;
  return (
    <>
      <h2 className="panel-title">
        {name.trim() || defaultName(base, kind.result)}{" "}
        <span className="badge" data-testid="result-label">
          {RESULT_LABELS[kind.result]}
        </span>
      </h2>
      {/* Labelled, so the plain model render is never read as the finished, coloured result. */}
      <div className="import-result">
        <figure>
          <img src={prepared.thumb} alt="" width={96} height={96} />
          <figcaption>Your photo</figcaption>
        </figure>
        {kind.result !== "photo" && (
          <figure>
            <Thumb entry={base} size={96} />
            <figcaption>Model, before colouring</figcaption>
          </figure>
        )}
      </div>
      <p className="hint">{what}</p>
      {prepared.colours.length > 0 && (
        <div className="row">
          <span className="row-label">Colours from the photo</span>
          <span className="swatches small" aria-hidden="true">
            {prepared.colours.map((c) => (
              <span key={c} className="swatch-dot" style={{ background: c }} />
            ))}
          </span>
        </div>
      )}
      {options.length > 1 && (
        <Chips
          label="Model (closest first)"
          options={options.map((e) => ({ id: e.id, name: e.name }))}
          value={base.id}
          onPick={setBaseId}
          testId="import-model"
          wrap
        />
      )}
      <label className="field">
        <span className="row-label">Name</span>
        <input
          className="text-input wide"
          value={name}
          placeholder={defaultName(base, kind.result)}
          maxLength={60}
          onChange={(e) => setName(e.currentTarget.value)}
          data-testid="import-name"
        />
      </label>
      <div className="sticky-actions">
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => void save(true)}
          data-testid="import-save-use"
        >
          {styleKeyOf(base) ? "Save and use on all tables" : "Save and place in the room"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void save(false)}
          data-testid="import-save"
        >
          Save to library
        </button>
      </div>
    </>
  );
}

const defaultName = (base: LibraryEntry, result: Imported["result"]) =>
  result === "photo"
    ? "Photo preview"
    : `${base.name.replace(/^Framed print on an easel$/, "Framed print")} (yours)`;

/** The site name of a product link, or the link itself if it does not parse. */
function hostOf(link: string): string {
  try {
    return new URL(link).hostname || link;
  } catch {
    return link;
  }
}

// ---- An imported item ---------------------------------------------------------------------------

function ItemDetail({
  id,
  onBack,
  onRequest,
}: {
  id: string;
  onBack: () => void;
  onRequest: (r: CustomRequest) => void;
}) {
  const { catalog, editor } = useStudio();
  const { library, cloud } = useServices();
  const imports = useStore(libraryStore, (s) => s.imports);
  const scenario = useEditor((s) => s.scenarios[s.activeId]);
  const imp = imports.find((i) => i.id === id);
  const e = catalog.get(id);
  if (!imp || !e || !scenario) return null;
  const styleKey = styleKeyOf(e);
  const tables = scenario.items.filter((i) => isTable(i, catalog)).length;
  // Already the room-wide choice, with no table dressed differently.
  const onAll =
    !!styleKey &&
    JSON.stringify(scenario.style[styleKey]) === JSON.stringify(stylePatch(e)?.[styleKey]) &&
    scenario.items.every((i) => !i.style || i.style[styleKey] === undefined);
  return (
    <div className="panel-body" data-testid="imported-detail">
      <div className="panel-head">
        <button type="button" className="plain-btn" onClick={onBack} data-testid="detail-back">
          <Icon name="back" size={18} /> Yours
        </button>
      </div>
      <h2 className="panel-title">
        {e.name} <ResultBadge entry={e} />
      </h2>
      <div className="import-result">
        <img src={imp.thumb} alt="Your photo" width={96} height={96} />
      </div>
      <div className="row">
        <span className="row-label">Real size</span>
        <span className="row-value">
          ≈ {imp.sizeCm.w} × {imp.sizeCm.h} cm
        </span>
      </div>
      {imp.link && (
        <div className="row">
          <span className="row-label">Source</span>
          <a
            className="row-value source-link"
            href={imp.link}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            {hostOf(imp.link)}
          </a>
        </div>
      )}
      {styleKey ? (
        <button
          type="button"
          className="btn primary"
          disabled={!tables || onAll}
          onClick={() => {
            editor.placeOrUse(e.id, viewStore.getState().focus);
          }}
          data-testid="use-on-tables"
        >
          {onAll ? "On every table" : "Use on all tables"}
        </button>
      ) : (
        <button
          type="button"
          className="btn primary"
          onClick={() => editor.addItem(e.id, viewStore.getState().focus)}
          data-testid="place-imported"
        >
          Place in the room
        </button>
      )}
      {styleKey && <p className="hint">To dress single tables, choose it in Décor.</p>}
      <button
        type="button"
        className="btn"
        onClick={() => onRequest(newRequest(e, imports, library.newId(), cloud.partner))}
        data-testid="request-custom"
      >
        Request a custom model
      </button>
      <button
        type="button"
        className="plain-btn"
        onClick={() => {
          void library.archiveImport(e.id);
          // Undo puts it back in the library (DESIGN_GUIDE §4: destructive actions carry Undo).
          editor.notify(
            `Removed “${e.name}” from the library`,
            () => void library.archiveImport(e.id, false),
          );
          onBack();
        }}
        data-testid="remove-imported"
      >
        <Icon name="trash" size={16} /> Remove from library
      </button>
    </div>
  );
}

// ---- Custom model requests ----------------------------------------------------------------------

const PLACEMENTS: { value: CustomRequest["placement"]; label: string }[] = [
  { value: "table", label: "On a table" },
  { value: "floor", label: "On the floor" },
  { value: "wall", label: "On a wall" },
  { value: "hanging", label: "Hanging" },
  { value: "ceiling", label: "Ceiling" },
];

/** REQ-01, REQ-02: what to build, its photos and size, and where it stands; both partners see it. */
function RequestForm({
  initial,
  isNew,
  onDone,
  onAdded,
}: {
  initial: CustomRequest;
  isNew: boolean;
  onDone: () => void;
  /** A ready model placed in the room (the phone sheet then drops to its peek). */
  onAdded: () => void;
}) {
  const { catalog, editor } = useStudio();
  const { library } = useServices();
  const [r, setR] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const patch = (p: Partial<CustomRequest>) => setR((x) => ({ ...x, ...p }));
  const built = requestStatus(r, catalog).entry;
  const num = (v: string) => Math.max(0, Math.round(Number(v)));

  const save = async () => {
    const next = { ...r, updatedAt: new Date().toISOString() };
    const ok = customRequestSchema.safeParse(next);
    if (!ok.success) {
      setError("Give it a name and a size of at least 1 cm.");
      return;
    }
    await library.saveRequest(ok.data);
    editor.notify(isNew ? "Request sent" : "Request updated");
    onDone();
  };
  const addPhoto = async (file: File | undefined) => {
    if (!file) return;
    setAdding(true);
    try {
      const bitmap = await library.decode(file);
      const p = await library.prepare(bitmap, FULL);
      bitmap.close();
      const id = await library.addImage(p.blob);
      patch({ imageIds: [...r.imageIds, id].slice(0, 6) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That photo could not be added.");
    } finally {
      setAdding(false);
    }
  };
  return (
    <div className="panel-body" data-testid="request-form">
      <div className="panel-head">
        <button type="button" className="plain-btn" onClick={onDone} data-testid="request-back">
          <Icon name="back" size={18} /> Yours
        </button>
      </div>
      <h2 className="panel-title">{isNew ? "Request a custom model" : r.name}</h2>
      <p className="hint">
        Claude builds it from your photos and notes and adds it to the library in an update.
      </p>
      {!isNew && (
        <div className="row">
          <span className="row-label">Status</span>
          <span className="row-value" data-testid="request-status">
            {requestStatus(r, catalog).label}
          </span>
        </div>
      )}
      {built && (
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            if (editor.placeOrUse(built.id, viewStore.getState().focus) === "placed") onAdded();
          }}
        >
          {styleKeyOf(built) ? "Use on all tables" : "Place in the room"} · {built.name}
        </button>
      )}
      <label className="field">
        <span className="row-label">What is it?</span>
        <input
          className="text-input wide"
          value={r.name}
          maxLength={60}
          onChange={(e) => patch({ name: e.currentTarget.value })}
          data-testid="request-name"
        />
      </label>
      <div className="size-row">
        {(["w", "d", "h"] as const).map((k) => (
          <label className="field" key={k}>
            <span className="row-label">{k === "w" ? "Width" : k === "d" ? "Depth" : "Height"} (cm)</span>
            <input
              className="text-input"
              type="number"
              inputMode="numeric"
              min={1}
              placeholder={k === "d" ? "Optional" : undefined}
              value={r.sizeCm[k] || ""}
              onChange={(e) => {
                const v = e.currentTarget.value;
                const sizeCm = { ...r.sizeCm, [k]: num(v) };
                if (k === "d" && v === "") delete sizeCm.d;
                patch({ sizeCm });
              }}
            />
          </label>
        ))}
      </div>
      <Chips
        label="Where it goes"
        options={PLACEMENTS.map((p) => ({ id: p.value, name: p.label }))}
        value={r.placement}
        onPick={(id) => patch({ placement: id as CustomRequest["placement"] })}
        testId="request-placement"
        wrap
      />
      <label className="field">
        <span className="row-label">Notes for Claude</span>
        <textarea
          className="text-input wide"
          rows={3}
          maxLength={1000}
          value={r.notes}
          placeholder="Must-match details, colours, what matters most"
          onChange={(e) => patch({ notes: e.currentTarget.value })}
          data-testid="request-notes"
        />
      </label>
      <div className="field">
        <span className="row-label">Photos ({r.imageIds.length} of 6) · kept private, never published</span>
        <RequestPhotos ids={r.imageIds} />
        {r.imageIds.length < 6 && (
          <label className="btn file-btn">
            <Icon name="upload" size={16} /> {adding ? "Adding…" : "Add a photo"}
            <input
              type="file"
              accept="image/*"
              disabled={adding}
              onChange={(e) => void addPhoto(e.currentTarget.files?.[0])}
            />
          </label>
        )}
      </div>
      {error && (
        <p className="hint error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn primary" onClick={() => void save()} data-testid="request-save">
        {isNew ? "Send request" : "Save"}
      </button>
    </div>
  );
}

function RequestPhotos({ ids }: { ids: readonly string[] }) {
  const { library } = useServices();
  const [urls, setUrls] = useState<(string | null)[]>([]);
  useEffect(() => {
    let live = true;
    void Promise.all(ids.map((id) => library.imageUrl(id))).then((u) => live && setUrls(u));
    return () => {
      live = false;
    };
  }, [ids, library]);
  if (!ids.length) return null;
  return (
    <div className="request-photos">
      {ids.map((id, i) =>
        urls[i] ? (
          <img key={id} src={urls[i] ?? ""} alt="" width={64} height={64} />
        ) : (
          <span key={id} className="photo-missing" />
        ),
      )}
    </div>
  );
}
