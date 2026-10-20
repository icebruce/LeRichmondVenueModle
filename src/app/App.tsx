import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { type CloudSync, getPartner, setPartner } from "../data/cloud";
import { downloadBlob, downloadScenario, fileName, readScenarioFile } from "../data/files";
import { PLAN_PIXELS, drawPlan } from "./plan";
import { jpegPagePdf } from "../domain/export/pdf";
import type { Studio } from "../scene/context";
import { StudioContext } from "../scene/context";
import { Studio3D } from "../scene/Studio3D";
import { useView } from "../scene/context";
import { createEditor } from "../state/editor";
import { Thumbnail } from "../scene/Thumbnail";
import { type Cloud, newId } from "./boot";
import { decodePhoto, preparePhoto } from "../data/images";
import { libraryStore } from "../state/library";
import { Login } from "../ui/Login";
import { type Partner, type Services, ServicesContext } from "../ui/services";
import { Counts, StudioUI } from "../ui/StudioUI";

const params = new URLSearchParams(window.location.search);
/** Printed on exports. */
const EVENT = "Le Richmond · 21 Nov 2026";

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image"))), type, quality),
  );
const bare = params.has("bare");
const thumb = params.get("thumb");

export function App({ studio: base, cloud }: { studio: Studio; cloud: Cloud }) {
  // The catalogue changes when imported items arrive (IMP-06); views recompute from the new one.
  const catalog = useSyncExternalStore(libraryStore.subscribe, cloud.catalog);
  const studio = useMemo(() => ({ ...base, catalog }), [base, catalog]);
  const [status, setStatus] = useState(cloud.status);
  const [partner, setPartnerState] = useState<Partner | null>(getPartner);
  const sync = useRef<CloudSync | null>(null);
  useEffect(() => {
    // start() is idempotent and the sync lives as long as the page, so StrictMode's double run is safe.
    if (status === "on") void cloud.start().then((s) => (sync.current = s));
  }, [status, cloud]);

  const services = useMemo<Services>(
    () => ({
      cloud: {
        status,
        partner,
        signIn: async (password, p) => {
          const error = await cloud.api.login(password);
          if (error) return error;
          setPartner(p);
          setPartnerState(p);
          setStatus("on");
          return null;
        },
        choosePartner: (p) => {
          setPartner(p);
          setPartnerState(p);
        },
        resolve: async (choice) => {
          await sync.current?.resolve(choice, newId);
        },
        versions: (id) => cloud.api.versions(id).catch(() => []),
        restore: async (id, revision) => (await sync.current?.restore(id, revision)) ?? false,
      },
      exportScenario: (id) => {
        const s = studio.editor.store.getState().scenarios[id];
        if (s) downloadScenario(s);
      },
      importScenario: async (file) => {
        try {
          const s = await readScenarioFile(file, newId(), new Date().toISOString());
          studio.editor.addScenario(s);
          studio.editor.notify(`Imported “${s.name}”`);
        } catch (e) {
          // Our own messages explain the problem ("too large"); parser errors are not for people.
          const own = e instanceof Error && e.message.startsWith("That file");
          studio.editor.notify(own ? e.message : "That file isn't a Richmond Studio scenario.");
        }
      },
      exportPlan: async (format) => {
        const scenario = studio.editor.active();
        studio.editor.notify("Preparing the plan…");
        const canvas = document.createElement("canvas");
        const today = new Date().toLocaleDateString("en-CA", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
        drawPlan(canvas, scenario, studio.venue, studio.catalog, EVENT, today);
        if (format === "png") {
          downloadBlob(await toBlob(canvas, "image/png"), fileName(`${scenario.name} plan`, "png"));
          studio.editor.notify("Plan saved as an image");
          return;
        }
        const jpeg = new Uint8Array(await (await toBlob(canvas, "image/jpeg", 0.92)).arrayBuffer());
        const pdf = jpegPagePdf(jpeg, PLAN_PIXELS.width, PLAN_PIXELS.height);
        downloadBlob(
          new Blob([pdf.slice().buffer], { type: "application/pdf" }),
          fileName(`${scenario.name} plan`, "pdf"),
        );
        studio.editor.notify("Plan saved as a PDF");
      },
      library: {
        decode: decodePhoto,
        prepare: preparePhoto,
        addImport: (item, image) => cloud.library.addImport(item, image),
        archiveImport: (id, archived) => cloud.library.archiveImport(id, archived),
        addImage: async (image) => {
          const id = `img-${newId()}`;
          await cloud.library.addImage(id, image);
          return id;
        },
        saveRequest: (r) => cloud.library.saveRequest(r),
        imageUrl: (id) => cloud.library.imageUrl(id),
        newId,
      },
      viewFile: (image) =>
        new File([image], fileName(`${studio.editor.active().name} view`, "png"), { type: "image/png" }),
      saveFile: async (file, share) => {
        // Closing the share sheet is no failure; anything else is said.
        if (share)
          await navigator.share({ files: [file] }).catch((e: unknown) => {
            if (!(e instanceof DOMException && e.name === "AbortError"))
              studio.editor.notify("Couldn't share the image. Try Save image on a computer.");
          });
        else downloadBlob(file, file.name);
      },
    }),
    [studio, status, partner, cloud],
  );
  const compare = useCompare(studio);
  // Side by side, the halves share the area the interface leaves free (DESIGN_GUIDE §3).
  const insetLeft = useView((s) => s.insetLeft);
  const insetBottom = useView((s) => s.insetBottom);
  const activeId = useSyncExternalStore(
    studio.editor.store.subscribe,
    () => studio.editor.store.getState().activeId,
  );
  if (thumb) return <Thumbnail base={studio} id={thumb} />;
  if (status === "signin")
    return (
      <ServicesContext.Provider value={services}>
        <Login />
      </ServicesContext.Provider>
    );
  return (
    <StudioContext.Provider value={studio}>
      <ServicesContext.Provider value={services}>
        <div className="studio">
          <div
            className={`viewport ${compare ? "split" : ""}`}
            style={compare ? { left: insetLeft, bottom: insetBottom } : undefined}
          >
            <div className="pane">
              <Studio3D studio={studio} />
              {compare && !bare && <Counts id={activeId} />}
            </div>
            {compare && (
              <div className="pane" aria-label={`Compared with ${compare.name}`}>
                <Studio3D studio={compare.studio} follow />
                {!bare && <Counts id={compare.id} />}
              </div>
            )}
          </div>
          {!bare && <StudioUI />}
        </div>
      </ServicesContext.Provider>
    </StudioContext.Provider>
  );
}

/**
 * The scenario shown beside the active one (SCN-06): a read-only copy kept in step with the main
 * editor, so edits to either scenario show in both halves.
 */
function useCompare(studio: Studio): { studio: Studio; name: string; id: string } | null {
  const id = useView((s) => s.compare);
  const mirror = useMemo(() => {
    const s = id ? studio.editor.store.getState().scenarios[id] : undefined;
    if (!s) return null;
    const editor = createEditor(
      { venue: studio.venue, catalog: studio.catalog, now: () => s.updatedAt, newId },
      [s],
    );
    editor.setCamera(studio.editor.store.getState().camera);
    return { ...studio, editor, readOnly: true };
  }, [id, studio]);
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!mirror || !id) return;
    const read = () => setName(studio.editor.store.getState().scenarios[id]?.name ?? null);
    read();
    return studio.editor.store.subscribe((st, prev) => {
      const s = st.scenarios[id];
      if (s && s !== prev.scenarios[id]) mirror.editor.replaceScenario(s);
      if (st.camera !== prev.camera) mirror.editor.setCamera(st.camera);
      read();
    });
  }, [mirror, id, studio]);
  return mirror && id && name !== null ? { studio: mirror, name, id } : null;
}
