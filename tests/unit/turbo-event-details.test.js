// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { Application } from "@hotwired/stimulus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PANEL_BRIDGE_PROPERTY,
  SCAN_REFRESHED_EVENT,
  SHOW_CONTROLLER_DETAILS_EVENT,
  SHOW_EVENT_ATTRIBUTE_EVENT,
} from "../../lib/constants.js";
import { DetailsPanelController } from "../../lib/panel/controllers/details-panel-controller.js";

const markup = readFileSync("entrypoints/panel/index.html", "utf8");
const html = "<turbo-frame>\n" + "x".repeat(150) + "</turbo-frame>";
// Let Stimulus and MutationObserver callbacks finish before the next action.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
let app, panel, source, bridge;

function showAttribute(row = source, attribute = "html", value = html) {
  document.dispatchEvent(
    new CustomEvent(SHOW_EVENT_ATTRIBUTE_EVENT, {
      detail: { source: row, name: "turbo:frame-render", attribute, value },
    }),
  );
}
function showController() {
  document.dispatchEvent(
    new CustomEvent(SHOW_CONTROLLER_DETAILS_EVENT, {
      detail: { nodeId: "node1", identifier: "hello" },
    }),
  );
}

beforeEach(async () => {
  const template = document.createElement("template");
  template.innerHTML = markup;
  document.body.appendChild(template.content.querySelector("#details-panel"));
  panel = document.querySelector("#details-panel");
  source = document.createElement("div");
  document.body.appendChild(source);
  bridge = {
    onValuesChanged() {},
    unwatchControllerValues: vi.fn().mockResolvedValue({ success: true }),
    async controllerValues() {
      return { success: true, values: [] };
    },
    async controllerTargets() {
      return { success: true, targets: [] };
    },
    async controllerOutlets() {
      return { success: true, outlets: [] };
    },
    watchControllerValues: vi.fn().mockResolvedValue({ success: true }),
  };
  document[PANEL_BRIDGE_PROPERTY] = bridge;
  app = Application.start();
  app.register("details-panel", DetailsPanelController);
  await settle();
});
afterEach(async () => {
  document.body.replaceChildren();
  await settle();
  app.stop();
  delete document[PANEL_BRIDGE_PROPERTY];
});

describe("Details panel event attributes", () => {
  it("opens the selected attribute as inert text with its event name", () => {
    showAttribute();
    expect(bridge.unwatchControllerValues).toHaveBeenCalledOnce();
    expect(panel.classList.contains("open")).toBe(true);
    expect(panel.querySelector("h2").textContent).toBe(
      "turbo:frame-render — html",
    );
    expect(panel.querySelector(".event-attribute-content").textContent).toBe(
      html,
    );
    expect(panel.querySelector("turbo-frame")).toBeNull();
    expect(source.classList.contains("selected")).toBe(true);
  });

  it("replaces the content and moves the highlight when another event is selected", () => {
    const next = document.createElement("div");
    document.body.appendChild(next);
    showAttribute();
    showAttribute(next, "url", "https://app.test/");
    expect(source.classList.contains("selected")).toBe(false);
    expect(next.classList.contains("selected")).toBe(true);
    expect(panel.querySelector("h2").textContent).toBe(
      "turbo:frame-render — url",
    );
    expect(panel.querySelector(".event-attribute-content").textContent).toBe(
      "https://app.test/",
    );
  });

  it("keeps a captured snapshot open through unrelated DOM changes and scan refreshes", async () => {
    showAttribute();
    document.body.appendChild(document.createElement("div"));
    document.dispatchEvent(
      new CustomEvent(SCAN_REFRESHED_EVENT, { detail: { items: [] } }),
    );
    await settle();
    expect(panel.classList.contains("open")).toBe(true);
    expect(panel.querySelector(".event-attribute-content").textContent).toBe(
      html,
    );
  });

  it("closes and releases the snapshot when the source row is removed", async () => {
    showAttribute();
    source.remove();
    await settle();
    expect(panel.classList.contains("open")).toBe(false);
    expect(panel.querySelector(".event-attribute-content").textContent).toBe(
      "",
    );
    expect(source.classList.contains("selected")).toBe(false);
  });

  it("clears the highlight and content when the user closes the panel", () => {
    showAttribute();
    panel.querySelector(".details-panel-close").click();
    expect(panel.classList.contains("open")).toBe(false);
    expect(source.classList.contains("selected")).toBe(false);
    expect(panel.querySelector(".event-attribute-content").textContent).toBe(
      "",
    );
  });

  it("releases event selection when controller details replace it", async () => {
    showAttribute();
    showController();
    await settle();
    expect(panel.querySelector("h2").textContent).toBe("hello");
    expect(source.classList.contains("selected")).toBe(false);
    expect(panel.querySelector(".event-attribute-content").textContent).toBe(
      "",
    );
  });

  it("removes the highlight when the details panel is disconnected", async () => {
    showAttribute();
    panel.remove();
    await settle();
    expect(source.classList.contains("selected")).toBe(false);
  });

  it("does not restart controller watches when a pending read finishes in event mode", async () => {
    let finishRead;
    bridge.controllerValues = () =>
      new Promise((resolve) => {
        finishRead = resolve;
      });
    showController();
    showAttribute();
    finishRead({ success: true, values: [] });
    await settle();
    expect(bridge.watchControllerValues).not.toHaveBeenCalled();
  });
});
