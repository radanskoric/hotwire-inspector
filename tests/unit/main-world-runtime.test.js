// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { MainWorldRuntime } from "../../lib/main_world/runtime.js";
import { createControllerStorage } from "../../lib/main_world/controller-storage.js";

const runtimes = [];
afterEach(() => {
  runtimes.forEach((runtime) => runtime.stop());
  runtimes.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function runtime(factories = []) {
  const instance = new MainWorldRuntime(document, factories);
  runtimes.push(instance);
  return instance;
}
function feature(operations = {}) {
  return { start: vi.fn(), stop: vi.fn(), operations };
}
const operation = {
  handle: () => ({ success: true }),
  validate: (value) => value,
};

it("defers factories and page effects until start and has symmetric idempotent cleanup", () => {
  const item = feature();
  const factory = vi.fn(() => item);
  const add = vi.spyOn(document, "addEventListener");
  const remove = vi.spyOn(document, "removeEventListener");
  const instance = runtime([factory]);
  expect(factory).not.toHaveBeenCalled();
  expect(add).not.toHaveBeenCalled();
  instance.start();
  instance.start();
  expect(factory).toHaveBeenCalledExactlyOnceWith(document);
  expect(item.start).toHaveBeenCalledTimes(1);
  expect([...instance.operations.keys()]).toEqual([]);
  instance.stop();
  instance.stop();
  expect(item.stop).toHaveBeenCalledTimes(1);
  expect(remove.mock.calls).toEqual(add.mock.calls);
  instance.start();
  expect(item.start).toHaveBeenCalledTimes(2);
});

it("contains factory, partial startup and cleanup failures and starts remaining features", () => {
  const broken = feature({ storeController: operation });
  broken.start.mockImplementation(() => {
    throw new Error("start");
  });
  broken.stop.mockImplementation(() => {
    throw new Error("stop");
  });
  const good = feature({ controllerValueDefinitions: operation });
  const instance = runtime([
    () => {
      throw new Error("factory");
    },
    () => broken,
    () => good,
  ]);
  instance.start();
  expect(broken.stop).toHaveBeenCalledTimes(1);
  expect(good.start).toHaveBeenCalledTimes(1);
  expect([...instance.operations.keys()]).toEqual([
    "controllerValueDefinitions",
  ]);
  expect(instance.diagnostics.map((entry) => entry.phase)).toEqual([
    "factory",
    "start",
    "stop",
  ]);
  instance.stop();
  expect(good.stop).toHaveBeenCalledTimes(1);
  expect(instance.operations.size).toBe(0);
});

it("rejects duplicate, reserved and unknown operation registrations atomically", () => {
  const first = feature({ storeController: operation });
  const duplicate = feature({
    controllerValueDefinitions: operation,
    storeController: operation,
  });
  const reserved = feature({ bridgeStatus: operation });
  const unknown = feature({ eval: operation });
  const instance = runtime([
    () => first,
    () => duplicate,
    () => reserved,
    () => unknown,
  ]);
  instance.start();
  expect([...instance.operations.keys()]).toEqual(["storeController"]);
  expect(duplicate.start).not.toHaveBeenCalled();
  expect(instance.diagnostics).toHaveLength(3);
});

it("continues teardown after a feature stop throws and survives BFCache events", () => {
  const first = feature();
  first.stop.mockImplementation(() => {
    throw "broken";
  });
  const second = feature();
  const instance = runtime([() => first, () => second]);
  instance.start();
  window.dispatchEvent(
    new PageTransitionEvent("pagehide", { persisted: true }),
  );
  window.dispatchEvent(
    new PageTransitionEvent("pageshow", { persisted: true }),
  );
  expect(first.stop).not.toHaveBeenCalled();
  instance.stop();
  expect(second.stop).toHaveBeenCalledTimes(1);
  expect(instance.diagnostics[0].error).toBe("MAIN-world operation failed");
});

it("rejects operations without both a handler and result validator", () => {
  const missingHandler = feature({
    storeController: { validate: operation.validate },
  });
  const missingValidator = feature({
    storeController: { handle: operation.handle },
  });
  const instance = runtime([() => missingHandler, () => missingValidator]);
  instance.start();
  expect(instance.operations.size).toBe(0);
  expect(instance.diagnostics).toHaveLength(2);
  expect(missingHandler.start).not.toHaveBeenCalled();
  expect(missingValidator.start).not.toHaveBeenCalled();
});

it("registers one lean anonymous HTTP/HTTPS MAIN bootstrap with no unsolicited globals or DOM changes", async () => {
  vi.stubGlobal("defineContentScript", (definition) => definition);
  const { default: entrypoint } =
    await import("../../entrypoints/main-world.content.js");
  expect(entrypoint).toMatchObject({
    matches: ["http://*/*", "https://*/*"],
    world: "MAIN",
    runAt: "document_start",
    globalName: false,
  });
  const globals = Object.keys(window);
  const html = document.documentElement.outerHTML;
  const start = vi
    .spyOn(MainWorldRuntime.prototype, "start")
    .mockImplementation(function () {
      runtimes.push(this);
    });
  entrypoint.main();
  expect(start).toHaveBeenCalledTimes(1);
  expect(start.mock.instances[0].factories).toEqual([createControllerStorage]);
  expect(Object.keys(window)).toEqual(globals);
  expect(document.documentElement.outerHTML).toBe(html);
});
