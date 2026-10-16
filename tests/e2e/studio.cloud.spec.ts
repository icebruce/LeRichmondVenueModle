import { type Browser, type Page, expect, test } from "@playwright/test";
import { settle } from "./helpers";

test.describe.configure({ mode: "serial" });

type St = {
  activeId: string;
  saveState: string;
  conflict: { id: string } | null;
  scenarios: Record<string, { name: string; guests: { count: number }; notes: { text: string }[] }>;
};
const state = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __studio: { editor: { store: { getState: () => St } } } }
    ).__studio.editor.store.getState(),
  );

async function signIn(browser: Browser, partner: "A" | "B") {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/?quality=low");
  await page.getByLabel("Password").fill("wedding-test");
  await page.getByRole("radio", { name: `Partner ${partner}` }).click();
  await page.getByRole("button", { name: "Open the studio" }).click();
  await page.waitForFunction(() => (window as unknown as { __project?: unknown }).__project, null, {
    timeout: 60_000,
  });
  await expect(page.locator(".loading")).toHaveCount(0, { timeout: 120_000 });
  await settle(page);
  await expect(page.getByTestId("save-state")).toHaveText("Saved · shared", { timeout: 20_000 });
  return page;
}

test("[ACC-01] the studio asks for the shared password; a wrong one is refused", async ({ page }) => {
  await page.goto("/?quality=low");
  await expect(page.getByRole("button", { name: "Open the studio" })).toBeVisible();
  await page.getByLabel("Password").fill("not-it");
  await page.getByRole("button", { name: "Open the studio" }).click();
  await expect(page.getByRole("alert")).toHaveText("Choose who this device is for.");
  await page.getByRole("radio", { name: "Partner B" }).click();
  await page.getByRole("button", { name: "Open the studio" }).click();
  await expect(page.getByRole("alert")).toHaveText("That password isn't right");
});

test("[SCN-02] [SCN-05] a change and a note on the laptop appear on the phone after reload", async ({
  browser,
}) => {
  const a = await signIn(browser, "A");
  const id = (await state(a)).activeId;
  await a.evaluate(
    (n) =>
      (
        window as unknown as { __studio: { editor: { setGuests: (n: number) => void } } }
      ).__studio.editor.setGuests(n),
    88,
  );
  await a.getByTestId("section-compare").click();
  await a.getByTestId("note-input").fill("Long tables feel fuller.");
  await a.getByRole("button", { name: "Add" }).click();
  await expect(a.getByTestId("notes")).toContainText("Partner A");
  await expect(a.getByTestId("save-state")).toHaveText("Saved · shared", { timeout: 20_000 });
  await a.waitForTimeout(2500);
  await a.context().close();
  const b = await signIn(browser, "B");
  const sb = await state(b);
  expect(sb.scenarios[id]?.guests.count).toBe(88);
  expect(sb.scenarios[id]?.notes.map((n) => n.text)).toEqual(["Long tables feel fuller."]);
  await b.context().close();
});

test("[SCN-03] editing the same scenario on both devices asks: keep mine, take theirs or save a copy", async ({
  browser,
}) => {
  const a = await signIn(browser, "A");
  const b = await signIn(browser, "B");
  const id = (await state(a)).activeId;
  await b.evaluate(
    (sid) =>
      (
        window as unknown as { __studio: { editor: { switchScenario: (s: string) => void } } }
      ).__studio.editor.switchScenario(sid),
    id,
  );
  await a.evaluate(() =>
    (
      window as unknown as { __studio: { editor: { setGuests: (n: number) => void } } }
    ).__studio.editor.setGuests(120),
  );
  await a.waitForTimeout(3000);
  await b.evaluate(() =>
    (
      window as unknown as { __studio: { editor: { setGuests: (n: number) => void } } }
    ).__studio.editor.setGuests(40),
  );
  await expect(b.getByRole("dialog")).toContainText("Partner A changed", { timeout: 20_000 });
  await b.getByRole("button", { name: "Save mine as a copy" }).click();
  await expect(b.getByRole("dialog")).toHaveCount(0);
  const sb = await state(b);
  expect(sb.scenarios[id]?.guests.count).toBe(120);
  expect(Object.values(sb.scenarios).some((s) => s.name.endsWith("(mine)") && s.guests.count === 40)).toBe(
    true,
  );
  await a.context().close();
  await b.context().close();
});

test("[SCN-04] version history lists earlier saves and restores one", async ({ browser }) => {
  const a = await signIn(browser, "A");
  await a.evaluate(() =>
    (
      window as unknown as { __studio: { editor: { renameScenario: (n: string) => void } } }
    ).__studio.editor.renameScenario("Round tables"),
  );
  await a.waitForTimeout(3000);
  await a.getByTestId("scenario-menu").click();
  await a.getByTestId("history").click();
  await expect(a.getByTestId("versions").locator("li").first()).toBeVisible();
  await a.getByTestId("versions").getByRole("button", { name: "Restore" }).first().click();
  await expect(a.getByTestId("toast")).toContainText("Restored");
  await a.context().close();
});
