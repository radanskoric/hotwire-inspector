import { describe, it, expect, vi } from "vitest";
import { handleTabUpdated } from "../../lib/background-handler.js";
import { TREE_CHANGED_PUSH_TYPE } from "../../lib/constants.js";

function createFakePort() {
  return {
    postMessage: vi.fn(),
  };
}

describe("handleTabUpdated", () => {
  it("sends a tree-changed push when the tab finishes loading", () => {
    const port = createFakePort();
    const panelPortsByTab = new Map([[1, port]]);

    handleTabUpdated(panelPortsByTab, 1, { status: "complete" });

    expect(port.postMessage).toHaveBeenCalledWith({
      type: TREE_CHANGED_PUSH_TYPE,
    });
  });

  it("does not send a push for tabs without an open panel", () => {
    const port = createFakePort();
    const panelPortsByTab = new Map([[1, port]]);

    handleTabUpdated(panelPortsByTab, 2, { status: "complete" });

    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it("does not send a push while the tab is still loading", () => {
    const port = createFakePort();
    const panelPortsByTab = new Map([[1, port]]);

    handleTabUpdated(panelPortsByTab, 1, { status: "loading" });

    expect(port.postMessage).not.toHaveBeenCalled();
  });
});
