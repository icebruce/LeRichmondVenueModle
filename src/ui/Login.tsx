import { useState } from "react";
import { type Partner, useServices } from "./services";

/** One shared password for both partners (ACC-01); the device remembers who it belongs to. */
export function Login() {
  const { cloud } = useServices();
  const [partner, setPartner] = useState<Partner>(cloud.partner ?? "A");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          const password = String(new FormData(e.currentTarget).get("password") ?? "");
          setBusy(true);
          setError(await cloud.signIn(password, partner));
          setBusy(false);
        }}
      >
        <span className="wordmark">Richmond Studio</span>
        <p className="hint">Private planner for our reception at Le Richmond.</p>
        <label className="field" htmlFor="password">
          <span className="row-label">Password</span>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="text-input wide"
            required
            autoFocus
          />
        </label>
        <div className="field">
          <span className="row-label">This device is for</span>
          <div className="seg seg-fill" role="radiogroup" aria-label="This device is for">
            {(["A", "B"] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={partner === p}
                className={partner === p ? "on" : ""}
                onClick={() => setPartner(p)}
              >
                Partner {p}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p className="refusal" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "Opening…" : "Open the studio"}
        </button>
        <p className="hint">
          Stays signed in on this device for 30 days. Notes you write are signed Partner {partner}.
        </p>
      </form>
    </main>
  );
}
