import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * End-to-end tests against the dev server with the imported SQLyst project
 * (npm run import:sqlyst). Editing tests work in a temporary section, so the
 * SQLyst content is never changed.
 */
test.describe.configure({ mode: "serial" });

const EDITOR = { email: "sqlyst@kshrd.local", password: "sqlyst12345" };
const ADMIN = { email: process.env.ADMIN_EMAIL ?? "admin@kshrd.local", password: process.env.ADMIN_PASSWORD ?? "admin12345" };
const SAMPLE_PNG = path.join(__dirname, "..", "..", "SQLyst_Report_Overleaf", "figures", "fig-erm-diagram.png");

async function login(browser: Browser, who: { email: string; password: string }): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.fill("#email", who.email);
  await page.fill("#password", who.password);
  await page.click("button:has-text('Sign in')");
  await page.waitForURL("**/projects");
  return page;
}

/** The editor holds the lock and everything is saved. */
async function waitSaved(page: Page) {
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
}

/** After an edit: wait until the autosave has actually run. */
async function waitEditSaved(page: Page) {
  await expect(page.getByText("Saved", { exact: true })).toBeHidden({ timeout: 5_000 });
  await waitSaved(page);
}

async function openSection(page: Page, title: string) {
  await page.goto("/projects/sqlyst");
  await page.locator("aside a", { hasText: title }).click();
  await expect(page.locator(".report-content")).toBeVisible();
  await waitSaved(page);
}

test("opening a section does not change it", async ({ browser }) => {
  const page = await login(browser, EDITOR);
  const saves: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.postData()?.includes('"content"')) saves.push(r.url());
  });
  await openSection(page, "Analysis");
  await page.waitForTimeout(3000);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(saves).toHaveLength(0);
});

test("text, a table, a figure and a cross-reference survive saving and reloading", async ({ browser }) => {
  const page = await login(browser, EDITOR);
  await page.goto("/projects/sqlyst");
  await page.getByTitle("Add to chapters").click();
  await page.waitForURL(/\/sections\//);
  await waitSaved(page);
  const run = `E2E ${Date.now()}`;
  await page.getByPlaceholder("Section title").fill(run);

  // Paragraph
  await page.locator(".report-content p").first().click();
  await page.keyboard.type("E2E paragraph with ");
  await page.getByRole("button", { name: "Insert the project name (printed in bold)" }).click();
  await page.keyboard.type(" in it.");

  // Table with a caption
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Insert table" }).click();
  await page.keyboard.type("Head A");
  await page.getByPlaceholder("Caption (shown above the table)").fill(`${run} table`);

  // Figure after the paragraph
  await page.locator(".report-content p").first().click();
  await page.keyboard.press("End");
  await page.locator(".sticky input[type=file]").first().setInputFiles(SAMPLE_PNG);
  await expect(page.locator(".report-content img[src^='/api/assets/']")).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder("Caption: describe what the figure shows").fill("E2E figure caption");

  // Cross-reference to the table
  await page.locator(".report-content p").first().click();
  await page.keyboard.press("End");
  await page.getByRole("button", { name: "Reference a figure, table or listing" }).click();
  await page.getByRole("button", { name: new RegExp(`${run} table`) }).click();
  await waitEditSaved(page);

  await page.reload();
  await waitSaved(page);
  const content = page.locator(".report-content");
  await expect(content).toContainText("E2E paragraph with");
  await expect(content.locator(".chip-name")).toHaveText("SQLyst");
  await expect(content.locator(".chip-ref")).toHaveText("Table #");
  await expect(content.locator(".chip-missing")).toHaveCount(0);
  await expect(content.locator("th").first()).toHaveText("Head A");
  const img = content.locator("img[src^='/api/assets/']");
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByPlaceholder("Caption: describe what the figure shows")).toHaveValue("E2E figure caption");
  await content.locator("th").first().click();
  await expect(page.getByPlaceholder("Caption (shown above the table)")).toHaveValue(`${run} table`);

  // Remove the temporary section.
  const row = page.locator("aside div.group", { hasText: run });
  await row.hover();
  await row.getByTitle("Delete section").click();
  await row.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL("**/projects/sqlyst");
  await expect(page.locator("aside", { hasText: run })).toHaveCount(0);
});

test("a second user sees a section being edited as read-only", async ({ browser }) => {
  const editor = await login(browser, EDITOR);
  await openSection(editor, "Conclusion");

  const admin = await login(browser, ADMIN);
  await admin.goto(editor.url());
  await expect(admin.getByText("is editing this section")).toBeVisible({ timeout: 15_000 });
  await expect(admin.getByText("Read only")).toBeVisible();
  await expect(admin.locator(".report-content")).toHaveAttribute("contenteditable", "false");

  // When the editor leaves, the admin can take over after reloading.
  await editor.goto("/projects/sqlyst");
  await admin.waitForTimeout(1500);
  await admin.reload();
  await waitSaved(admin);
  // Leave the page so the lock is released for the next run.
  await admin.goto("/projects");
  await admin.waitForTimeout(1000);
});

test("an editor can build the project PDF", async ({ browser }) => {
  const page = await login(browser, EDITOR);
  await page.goto("/projects/sqlyst");
  await page.getByRole("button", { name: "Build PDF" }).click();
  await expect(page.getByText(/Last build succeeded .* 28 pages/)).toBeVisible({ timeout: 200_000 });
});

test("the admin can build the book", async ({ browser }) => {
  const page = await login(browser, ADMIN);
  await page.goto("/admin/book");
  await page.getByRole("button", { name: "Build book PDF" }).click();
  await expect(page.getByText(/Last build succeeded/)).toBeVisible({ timeout: 220_000 });
});
