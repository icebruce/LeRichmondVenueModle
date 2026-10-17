import { useRef, useState } from "react";
import type { Scenario } from "../domain/scenario/schema";
import { countLayout } from "../domain/layout/counts";
import { adviseScenario } from "../domain/layout/advisories";
import { viewStore } from "../state/view";
import { useEditor, useStudio, useView } from "../scene/context";
import { Icon, type IconName } from "./icons";
import { useServices } from "./services";
import { VersionHistory } from "./Dialogs";
import { Chips, PageHead } from "./Panels";

/** Where the active plan is saved (DESIGN_GUIDE §7): "Saving…", "Saved · shared", or what went wrong. */
export function SaveState() {
  const state = useEditor((s) => s.saveState);
  const cloud = useEditor((s) => s.cloud);
  const text =
    state === "saving"
      ? "Saving…"
      : state === "offline"
        ? "Offline — kept on this device"
        : state === "error"
          ? cloud
            ? "Not shared yet — kept on this device"
            : "Not saved — storage unavailable"
          : cloud
            ? "Saved · shared"
            : "Saved on this device";
  return (
    <span className={`save-state ${state}`} data-testid="save-state">
      {text}
    </span>
  );
}

/** A plain action in a grouped list. */
function ActionRow({
  label,
  icon,
  onClick,
  testId,
  danger = false,
}: {
  label: string;
  icon?: IconName;
  onClick: () => void;
  testId?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`nav-row ${danger ? "danger" : ""}`}
      onClick={onClick}
      data-testid={testId}
    >
      {icon && <Icon name={icon} size={18} className="nav-icon" />}
      <span className="nav-label">{label}</span>
    </button>
  );
}

/**
 * Plans (SCN-01..06, SCN-08, EXP-01..02): the plans to switch between and what to do with them,
 * compare side by side, notes for each other, and files for the venue. Was the scenario menu and Compare.
 */
export function PlansPanel() {
  const { editor } = useStudio();
  const services = useServices();
  const scenarios = useEditor((s) => s.scenarios);
  const order = useEditor((s) => s.order);
  const activeId = useEditor((s) => s.activeId);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const renaming = renamingId === activeId;
  const [history, setHistory] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const active = scenarios[activeId];
  return (
    <div className="panel-body" data-testid="plans-panel">
      <PageHead title="Plans" />
      <div className="list" role="radiogroup" aria-label="Plans">
        {order.map((id) =>
          id === activeId && renaming && active ? (
            <form
              key={id}
              className="nav-row rename"
              onSubmit={(e) => {
                e.preventDefault();
                const v = new FormData(e.currentTarget).get("name");
                if (typeof v === "string") editor.renameScenario(v);
                setRenamingId(null);
              }}
            >
              <label className="sr-only" htmlFor="scenario-name">
                Plan name
              </label>
              <input
                id="scenario-name"
                name="name"
                className="text-input wide"
                defaultValue={active.name}
                maxLength={80}
                autoFocus
                onBlur={(e) => {
                  editor.renameScenario(e.currentTarget.value);
                  setRenamingId(null);
                }}
              />
            </form>
          ) : (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={id === activeId}
              className="nav-row"
              onClick={() => editor.switchScenario(id)}
            >
              <span className="nav-check">{id === activeId && <Icon name="check" size={18} />}</span>
              <span className="nav-label">{scenarios[id]?.name}</span>
            </button>
          ),
        )}
      </div>
      <div className="list">
        <ActionRow
          label="Rename"
          icon="pencil"
          onClick={() => setRenamingId(activeId)}
          testId="plan-rename"
        />
        <ActionRow
          label="Duplicate"
          icon="copy"
          onClick={() => editor.duplicateScenario(activeId)}
          testId="plan-duplicate"
        />
        <ActionRow
          label="New from venue sample"
          icon="plus"
          onClick={() => editor.createScenario("sample")}
          testId="plan-new-sample"
        />
        <ActionRow
          label="New empty room"
          icon="plus"
          onClick={() => editor.createScenario("blank")}
          testId="plan-new-empty"
        />
        {services.cloud.status === "on" && (
          <ActionRow label="Version history…" onClick={() => setHistory(true)} testId="history" />
        )}
      </div>
      <h3 className="group-title">Compare</h3>
      <CompareControls />
      <Notes />
      <h3 className="group-title">For the venue</h3>
      <div className="list">
        <ActionRow
          label="Plan for the venue (PDF)"
          icon="download"
          onClick={() => void services.exportPlan("pdf")}
          testId="export-pdf"
        />
        <ActionRow
          label="Plan as an image (PNG)"
          icon="download"
          onClick={() => void services.exportPlan("png")}
          testId="export-png"
        />
        <ActionRow
          label="Save this view as an image"
          icon="download"
          onClick={() => void services.saveView()}
          testId="save-view"
        />
        <ActionRow
          label="Save as file"
          icon="download"
          onClick={() => services.exportScenario(activeId)}
          testId="export-file"
        />
        <ActionRow
          label="Open file…"
          icon="upload"
          onClick={() => fileRef.current?.click()}
          testId="open-file"
        />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="import-file"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) void services.importScenario(f);
          e.currentTarget.value = "";
        }}
      />
      <div className="list">
        <ActionRow
          label="Delete this plan"
          icon="trash"
          danger
          onClick={() => editor.deleteScenario(activeId)}
          testId="plan-delete"
        />
      </div>
      {history && <VersionHistory onClose={() => setHistory(false)} />}
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
  const compare = useView((s) => s.compare);
  const others = order.filter((id) => id !== activeId);
  const pair = [scenarios[activeId], compare ? scenarios[compare] : undefined].filter(
    (s): s is Scenario => !!s,
  );
  const rows = pair.map((s) => {
    const c = countLayout(s.items, s.guests.count, catalog);
    const notes = adviseScenario(s, venue, catalog).length;
    return [c.tables, c.seats, c.withoutSeat, `≈ ${Math.round(c.danceFloorM2)} m²`, notes] as const;
  });
  const labels = ["Tables", "Seats", "Without a seat", "Dance area", "Checks"];
  if (others.length === 0)
    return (
      <div className="field">
        <p className="hint">Compare needs a second plan: start one from a copy of this one.</p>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            const from = activeId;
            editor.duplicateScenario(from);
            viewStore.setState({ compare: from });
          }}
          data-testid="compare-duplicate"
        >
          Duplicate this plan
        </button>
      </div>
    );
  return (
    <div className="field">
      <Chips
        label="Compare with"
        options={[
          { id: "none", name: "Off" },
          ...others.map((id) => ({ id, name: scenarios[id]?.name ?? id })),
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
