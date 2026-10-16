// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { ContentInspector } from "../../lib/content-inspector.js";
import { MAIN_WORLD_RPC_RESPONSE_EVENT } from "../../lib/constants.js";

let inspector;
afterEach(() => {
  inspector?.disconnect();
  vi.restoreAllMocks();
});

it("installs the bridge before ports/watchers and defers tree scans until readiness exactly once", () => {
  vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
  const add = vi.spyOn(document, "addEventListener");
  inspector = new ContentInspector({
    document,
    connectPort: () => {
      expect(add).toHaveBeenCalledWith(
        MAIN_WORLD_RPC_RESPONSE_EVENT,
        expect.any(Function),
      );
      return {
        postMessage() {},
        onDisconnect: { addListener() {}, removeListener() {} },
        disconnect() {},
      };
    },
  });
  const scan = vi.spyOn(inspector, "scan");
  inspector.startTreeWatcherWhenReady();
  inspector.startTreeWatcherWhenReady();
  document.body.appendChild(document.createElement("turbo-frame"));
  expect(scan).not.toHaveBeenCalled();
  expect(inspector.treeWatcher).toBeNull();
  document.dispatchEvent(new Event("DOMContentLoaded"));
  document.dispatchEvent(new Event("DOMContentLoaded"));
  inspector.startTreeWatcherWhenReady();
  expect(scan).toHaveBeenCalledTimes(1);
});

it.each(["interactive", "complete"])(
  "starts immediately for %s documents",
  (state) => {
    vi.spyOn(document, "readyState", "get").mockReturnValue(state);
    inspector = new ContentInspector({ document });
    const scan = vi.spyOn(inspector, "scan");
    inspector.startTreeWatcherWhenReady();
    inspector.startTreeWatcherWhenReady();
    expect(scan).toHaveBeenCalledTimes(1);
  },
);

it("disconnect before readiness cancels pending startup and bridge requests", async () => {
  vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
  inspector = new ContentInspector({ document });
  const scan = vi.spyOn(inspector, "scan");
  inspector.startTreeWatcherWhenReady();
  const pending = inspector.mainWorldClient.request("bridgeStatus");
  inspector.disconnect();
  await expect(pending).rejects.toThrow(/disconnected/);
  document.dispatchEvent(new Event("DOMContentLoaded"));
  expect(scan).not.toHaveBeenCalled();
});
