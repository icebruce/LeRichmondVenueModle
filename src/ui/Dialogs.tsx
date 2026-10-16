import { useEffect, useRef, useState } from "react";
import { useEditor, useStudio } from "../scene/context";
import { type Partner, type VersionInfo, useServices } from "./services";

const time = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button, input")?.focus();
    if (!onClose) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="scrim">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={ref}>
        <h2 className="panel-title" id="dialog-title">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

/** SCN-03: the partner saved a newer version while this device was editing. Three choices, no silent loss. */
export function ConflictDialog() {
  const { cloud } = useServices();
  const conflict = useEditor((s) => s.conflict);
  const mine = useEditor((s) => (conflict ? s.scenarios[conflict.id] : undefined));
  const [busy, setBusy] = useState(false);
  if (!conflict) return null;
  const who = conflict.theirs.updatedBy ? `Partner ${conflict.theirs.updatedBy}` : "Your partner";
  const pick = async (choice: "mine" | "theirs" | "copy") => {
    setBusy(true);
    await cloud.resolve(choice);
    setBusy(false);
  };
  return (
    <Modal title={`${who} changed “${conflict.theirs.name}”`}>
      <p className="dialog-text">
        {who} saved a newer version at {time(conflict.theirs.updatedAt)} while this device was editing it
        {mine ? ` (${mine.items.length} items here, ${conflict.theirs.items.length} in theirs)` : ""}. Nothing
        has been overwritten.
      </p>
      <div className="dialog-actions">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void pick("copy")}>
          Save mine as a copy
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void pick("theirs")}>
          Take theirs
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void pick("mine")}>
          Keep mine
        </button>
      </div>
      <p className="hint">“Keep mine” replaces theirs; their version stays in the version history.</p>
    </Modal>
  );
}

/** SCN-04: earlier saved versions of the active scenario, each restorable. */
export function VersionHistory({ onClose }: { onClose: () => void }) {
  const { cloud } = useServices();
  const { editor } = useStudio();
  const active = useEditor((s) => s.scenarios[s.activeId]);
  const [list, setList] = useState<VersionInfo[] | null>(null);
  useEffect(() => {
    if (active) void cloud.versions(active.id).then(setList);
  }, [cloud, active?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!active) return null;
  return (
    <Modal title={`Versions of “${active.name}”`} onClose={onClose}>
      {list === null ? (
        <p className="hint">Loading…</p>
      ) : list.length === 0 ? (
        <p className="hint">No earlier versions yet. Each save keeps the one before it.</p>
      ) : (
        <ul className="versions" data-testid="versions">
          {list.map((v) => (
            <li key={v.revision} className="row">
              <span className="row-label">
                {time(v.updatedAt)}
                {v.updatedBy ? ` · Partner ${v.updatedBy}` : ""}
                {v.name && v.name !== active.name ? ` · “${v.name}”` : ""}
              </span>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  if (await cloud.restore(active.id, v.revision)) {
                    editor.notify("Restored. The version it replaced is kept in the history.");
                    onClose();
                  }
                }}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

/** Asked once on a signed-in device that has not said whose it is (notes are signed with it). */
export function PartnerChooser() {
  const { cloud } = useServices();
  if (cloud.status !== "on" || cloud.partner) return null;
  return (
    <Modal title="Who uses this device?">
      <p className="dialog-text">Notes you write here are signed with this name.</p>
      <div className="dialog-actions">
        {(["A", "B"] as Partner[]).map((p) => (
          <button key={p} type="button" className="btn" onClick={() => cloud.choosePartner(p)}>
            Partner {p}
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Offline banner (DESIGN_GUIDE §7): edits continue and sync when the connection returns. */
export function OfflineBanner() {
  const state = useEditor((s) => s.saveState);
  if (state !== "offline") return null;
  return (
    <p className="banner glass" role="status">
      Offline — changes kept on this device
    </p>
  );
}
