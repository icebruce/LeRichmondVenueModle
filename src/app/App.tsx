import { useEffect, useMemo, useRef, useState } from "react";
import { type CloudSync, getPartner, setPartner } from "../data/cloud";
import { downloadBlob, downloadScenario, fileName, readScenarioFile } from "../data/files";
import { PLAN_SIZE, drawPlan } from "../data/plan";
import { jpegPagePdf } from "../domain/export/pdf";
import type { Studio } from "../scene/context";
import { StudioContext } from "../scene/context";
import { Studio3D } from "../scene/Studio3D";
import { useView } from "../scene/context";
import { createEditor } from "../state/editor";
import { Thumbnail } from "../scene/Thumbnail";
import { type Cloud, newId } from "./boot";
import { Login } from "../ui/Login";
import { type Partner, type Services, ServicesContext } from "../ui/services";
import { StudioUI } from "../ui/StudioUI";

const params = new URLSearchParams(window.location.search);
/** Printed on exports. */
const EVENT = "Le Richmond · 21 Nov 2026";

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image"))), type, quality),
  );
const bare = params.has("bare");
const thumb = params.get("thumb");

export function App({ studio, cloud }: { studio: Studio; cloud: Cloud }) {
  const [status, setStatus] = useState(cloud.status);
  const [partner, setPartnerState] = useState<Partner | null>(getPartner);
  const sync = useRef<CloudSync | null>(null);
  useEffect(() => {
    if (status !== "on" || sync.current) return;
    let cancelled = false;
    void cloud.start().then((s) => {
      if (cancelled) s.stop();
      else sync.current = s;
    });
    return () => {
      cancelled = true;
    };
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
        const canvas = document.createElement("canvas");
        const today = new Date().toLocaleDateString("en-CA", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
        drawPlan(canvas, scenario, studio.venue, studio.catalog, EVENT, today);
        if (format === "png") {
          downloadBlob(await toBlob(canvas, "image/png"), fileName(`${scenario.name} plan`, "png"));
          return;
        }
        const jpeg = new Uint8Array(await (await toBlob(canvas, "image/jpeg", 0.92)).arrayBuffer());
        const pdf = jpegPagePdf(jpeg, PLAN_SIZE.width, PLAN_SIZE.height);
        downloadBlob(
          new Blob([pdf.slice().buffer], { type: "application/pdf" }),
          fileName(`${scenario.name} plan`, "pdf"),
        );
      },
      saveView: async () => {
        const canvas = document.querySelector<HTMLCanvasElement>("[data-testid=studio-canvas] canvas");
        if (!canvas) return;
        downloadBlob(
          await toBlob(canvas, "image/png"),
          fileName(`${studio.editor.active().name} view`, "png"),
        );
      },
    }),
    [studio, status, partner, cloud],
  );
  const compare = useCompare(studio);
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
          <div className={`viewport ${compare ? "split" : ""}`}>
            <div className="pane">
              <Studio3D studio={studio} />
            </div>
            {compare && (
              <div className="pane" aria-label={`Compared with ${compare.name}`}>
                <Studio3D studio={compare.studio} follow />
                <span className="pane-label glass">{compare.name}</span>
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
function useCompare(studio: Studio): { studio: Studio; name: string } | null {
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
  return mirror && name !== null ? { studio: mirror, name } : null;
}
