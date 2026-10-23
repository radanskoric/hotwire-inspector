import { test, expect, chromium } from "@playwright/test";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { withStaticServer } from "./support/static-server.js";

test.beforeAll(() => {
  execFileSync(
    "node_modules/.bin/wxt",
    ["build", "-c", "tests/main-world-gate.config.js"],
    { stdio: "pipe" },
  );
});

for (const order of ["main-first", "client-first"]) {
  test(`installed MAIN bridge: ${order}`, async () => {
    await withStaticServer(
      path.resolve("tests/e2e/fixtures/main-world-gate"),
      async (origin) => {
        const extension = path.resolve("output/main-world-gate/chrome-mv3");
        const context = await chromium.launchPersistentContext("", {
          headless: true,
          channel: "chromium",
          ignoreDefaultArgs: ["--disable-extensions"],
          args: [
            `--disable-extensions-except=${extension}`,
            `--load-extension=${extension}`,
          ],
        });
        try {
          const page = await context.newPage();
          await page.goto(`${origin}/page.html?${order}`);
          await expect(page.locator("#result")).not.toHaveText("pending");
          const result = JSON.parse(
            await page.locator("#result").textContent(),
          );
          expect(result).toMatchObject({
            success: true,
            value: "page-owned-value",
            isolated: true,
            addedGlobals: [],
            insertedScripts: 0,
            scriptsUnchanged: true,
            storedControllerMatches: true,
            storage: { success: true, name: "temp1", identifier: "fixture" },
          });
          test.info().annotations.push({
            type: "browser-gate",
            description: JSON.stringify(result),
          });
        } finally {
          await context.close();
        }
      },
    );
  });
}
