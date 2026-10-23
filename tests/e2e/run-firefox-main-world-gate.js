import { cmd } from "web-ext";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

execFileSync(
  "node_modules/.bin/wxt",
  ["build", "-c", "tests/main-world-gate.config.js", "-b", "firefox", "--mv3"],
  { stdio: "inherit" },
);
const results = [];
const cases = ["main-first", "client-first"].flatMap((order) =>
  ["Stimulus", "stimulusApp", "StimulusApp"].map(
    (application) => `?${order}&application=${application}`,
  ),
);
let complete;
const finished = new Promise((resolve) => {
  complete = resolve;
});
const root = path.resolve("tests/e2e/fixtures/main-world-gate");
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/gate-result" && request.method === "POST") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    results.push(JSON.parse(raw));
    response.end("ok");
    if (results.length === cases.length) complete();
  } else if (["/page.html", "/page.js"].includes(url.pathname)) {
    response.setHeader(
      "Content-Type",
      url.pathname.endsWith(".js") ? "text/javascript" : "text/html",
    );
    response.end(await readFile(path.join(root, url.pathname)));
  } else {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let runner;
let timer;
try {
  runner = await cmd.run(
    {
      sourceDir: path.resolve("output/main-world-gate/firefox-mv3"),
      firefox:
        process.env.FIREFOX_BINARY ||
        "/Applications/Firefox.app/Contents/MacOS/firefox",
      noReload: true,
      noInput: true,
      args: ["-headless"],
      startUrl: cases.map((query) => `${origin}/page.html${query}`),
    },
    { shouldExitProgram: false },
  );
  await Promise.race([
    finished,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Installed Firefox gate timed out")),
        15000,
      );
    }),
  ]);
  for (const result of results) {
    console.log(JSON.stringify(result));
    assert.equal(result.success, true);
    assert.equal(result.value, "page-owned-value");
    assert.equal(result.isolated, true);
    assert.deepEqual(result.addedGlobals, []);
    assert.equal(result.insertedScripts, 0);
    assert.equal(result.scriptsUnchanged, true);
    assert.equal(result.storedControllerMatches, true);
    assert.deepEqual(result.storage, {
      success: true,
      name: "temp1",
      identifier: "fixture",
    });
  }
  assert.deepEqual(results.map((result) => result.order).sort(), cases.sort());
} finally {
  clearTimeout(timer);
  await runner?.exit();
  await new Promise((resolve) => server.close(resolve));
}
