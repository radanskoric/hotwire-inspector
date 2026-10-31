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
          ignoreDefaultArgs: [
            "--disable-extensions",
            "--disable-back-forward-cache",
          ],
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
            oneResponsePerRequest: true,
            definitions: {
              success: true,
              definitions: [
                {
                  name: "options",
                  type: "object",
                  attributeName: "data-fixture-options-value",
                  defaultValue: { enabled: true, items: [1, null] },
                },
              ],
            },
            outlets: { success: true, outlets: ["menu", "status"] },
            failure: { success: false, error: "fixture getter failed" },
            storage: { success: true, name: "temp1", identifier: "fixture" },
            turbo: {
              early:
                order === "main-first"
                  ? { bridges: 1, pushes: 1 }
                  : { bridges: 0, pushes: 0 },
              count: 4,
              snapshot: true,
              fields: true,
              target: true,
              timestamp: true,
              empty: true,
              oversized: true,
              sourceSafety: true,
            },
          });
          test.info().annotations.push({
            type: "browser-gate",
            description: JSON.stringify(result),
          });
          await page.evaluate(() => {
            window.addEventListener("pageshow", (event) => {
              window.mainWorldFixture.restored = event.persisted;
            });
          });
          await page.goto(`${origin}/page.html?main-first&away`);
          await expect(page.locator("#result")).not.toHaveText("pending");

          await page.goBack({ waitUntil: "commit", timeout: 5000 });

          expect(
            await page.evaluate(() => ({
              restored: window.mainWorldFixture.restored,
              same: window.temp1 === window.mainWorldFixture.controller,
              repeatedStorage: "temp2" in window,
            })),
          ).toEqual({ restored: true, same: true, repeatedStorage: false });
          const restored = await page.evaluate(
            () =>
              new Promise((resolve) => {
                document.addEventListener(
                  "gate:rechecked",
                  (event) => resolve(JSON.parse(event.detail)),
                  { once: true },
                );
                document.dispatchEvent(new Event("gate:recheck"));
              }),
          );
          expect(restored).toEqual({
            definitions: result.definitions,
            outlets: result.outlets,
          });
          const restoredTurbo = await page.evaluate(
            () =>
              new Promise((resolve) => {
                document.addEventListener(
                  "gate:turbo-push",
                  (event) => resolve(JSON.parse(event.detail)),
                  { once: true },
                );
                const incoming = document.createElement("turbo-frame");
                incoming.textContent = "restored";
                document.querySelector("#result").dispatchEvent(
                  new CustomEvent("turbo:before-frame-render", {
                    bubbles: true,
                    detail: { newFrame: incoming },
                  }),
                );
              }),
          );
          expect(restoredTurbo).toMatchObject({
            name: "turbo:before-frame-render",
            targetId: "result",
            details: { html: "<turbo-frame>restored</turbo-frame>" },
          });
        } finally {
          await context.close();
        }
      },
    );
  });
}
