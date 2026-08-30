// @vitest-environment happy-dom

import { Application } from "@hotwired/stimulus";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBoxController } from "../../lib/panel/controllers/event-box-controller.js";
import { PANEL_BRIDGE_PROPERTY } from "../../lib/constants.js";

describe("EventBoxController", () => {
  let application;
  let calls;
  let inspectResponse;
  let reveal;

  beforeEach(async () => {
    calls = [];
    inspectResponse = { success: true, selector: "#main-frame" };
    document.body.innerHTML = `
      <template id="notice-template">
        <div
          class="status-notice"
          data-controller="status"
          data-status-tone-value=""
          role="status"
          aria-live="polite"
        >
          <span slot="text"></span>
        </div>
      </template>
      <img
        class="icon icon-btn event-reveal"
        src="/icons/reveal-in-elements.svg"
        data-controller="event-box"
        data-event-box-target-id-value="frame-1"
        data-action="click->event-box#inspect"
      />
    `;
    document[PANEL_BRIDGE_PROPERTY] = {
      inspectNode(id) {
        calls.push(["inspectNode", id]);
        return Promise.resolve(inspectResponse);
      },
    };

    application = Application.start();
    application.register("event-box", EventBoxController);
    reveal = document.querySelector(".event-reveal");

    await Promise.resolve();
  });

  afterEach(() => {
    application.stop();
    document.body.innerHTML = "";
    delete document[PANEL_BRIDGE_PROPERTY];
  });

  it("calls inspectNode with the controller's target id when clicked", async () => {
    reveal.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(calls).toEqual([["inspectNode", "frame-1"]]);
  });

  it("does not render any notice when the inspect call succeeds", async () => {
    reveal.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector(".status-notice")).toBeNull();
  });

  it("renders a warning notice when the inspect call reports success: false", async () => {
    inspectResponse = { success: false, selector: null };

    reveal.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    const notice = document.querySelector(".status-notice");
    expect(notice).not.toBeNull();
    expect(notice.dataset.statusToneValue).toBe("warning");
    expect(notice.textContent).toContain("Element no longer exists");
  });

  it("still inspects when the response has selector null but success: true", async () => {
    inspectResponse = { success: true, selector: null };

    reveal.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(calls).toEqual([["inspectNode", "frame-1"]]);
    expect(document.querySelector(".status-notice")).toBeNull();
  });
});
