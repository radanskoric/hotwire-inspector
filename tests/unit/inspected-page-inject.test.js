// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTROLLER_OUTLET_DEFINITIONS_REQUEST_EVENT,
  CONTROLLER_OUTLET_DEFINITIONS_RESPONSE_EVENT,
  CONTROLLER_VALUE_DEFINITIONS_REQUEST_EVENT,
  CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT,
} from "../../lib/constants.js";

const flushMicrotasks = async () => {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
};

function getCurrentScript(scriptEl) {
  Object.defineProperty(document, "currentScript", {
    configurable: true,
    get: () => scriptEl,
  });
}

async function loadInjectScript({ stimulus } = {}) {
  if (stimulus) {
    Object.assign(window, { Stimulus: stimulus });
  }
  vi.stubGlobal("defineUnlistedScript", (setup) => setup());
  await import("../../entrypoints/inspected-page-inject.js");
}

describe("inspected-page-inject", () => {
  /** @type {HTMLScriptElement} */
  let script;

  beforeEach(() => {
    document.body.innerHTML =
      '<div id="modal-controller" data-controller="modal"></div>';
    script = document.createElement("script");
    document.body.appendChild(script);
    getCurrentScript(script);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete window.Stimulus;
    delete document.currentScript;
    vi.resetModules();
  });

  it("answers with an error response when the request handler throws", async () => {
    await loadInjectScript({
      stimulus: {
        getControllerForElementAndIdentifier: () => {
          throw new Error("boom");
        },
      },
    });

    let responseDetail = null;
    script.addEventListener(
      CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT,
      (event) => {
        responseDetail = JSON.parse(event.detail);
      },
    );

    script.dispatchEvent(
      new CustomEvent(CONTROLLER_VALUE_DEFINITIONS_REQUEST_EVENT, {
        detail: JSON.stringify({
          selector: "#modal-controller",
          identifier: "modal",
          requestId: "req-1",
        }),
      }),
    );

    await flushMicrotasks();

    expect(responseDetail).not.toBeNull();
    expect(responseDetail.requestId).toBe("req-1");
    expect(responseDetail.success).toBe(false);
    expect(responseDetail.error).toBe("boom");
  });

  it("answers with null requestId and error when detail is malformed", async () => {
    await loadInjectScript({
      stimulus: {
        getControllerForElementAndIdentifier: () => {
          throw new Error("boom");
        },
      },
    });

    let responseDetail = null;
    script.addEventListener(
      CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT,
      (event) => {
        responseDetail = JSON.parse(event.detail);
      },
    );

    script.dispatchEvent(
      new CustomEvent(CONTROLLER_VALUE_DEFINITIONS_REQUEST_EVENT, {
        detail: "not-json-and-not-an-object",
      }),
    );

    await flushMicrotasks();

    expect(responseDetail).not.toBeNull();
    expect(responseDetail.requestId).toBeNull();
    expect(responseDetail.success).toBe(false);
    expect(typeof responseDetail.error).toBe("string");
  });

  it("answers value and outlet definition requests without storing a controller", async () => {
    class Controller {
      static outlets = ["preview"];
    }
    await loadInjectScript({
      stimulus: {
        getControllerForElementAndIdentifier: () => new Controller(),
      },
    });
    for (const [requestEvent, responseEvent, result] of [
      [
        CONTROLLER_VALUE_DEFINITIONS_REQUEST_EVENT,
        CONTROLLER_VALUE_DEFINITIONS_RESPONSE_EVENT,
        { definitions: [] },
      ],
      [
        CONTROLLER_OUTLET_DEFINITIONS_REQUEST_EVENT,
        CONTROLLER_OUTLET_DEFINITIONS_RESPONSE_EVENT,
        { outlets: ["preview"] },
      ],
    ]) {
      let response;
      script.addEventListener(
        responseEvent,
        (event) => {
          response = JSON.parse(event.detail);
        },
        { once: true },
      );
      script.dispatchEvent(
        new CustomEvent(requestEvent, {
          detail: JSON.stringify({
            selector: "#modal-controller",
            identifier: "modal",
            requestId: "req-1",
          }),
        }),
      );
      expect(response).toEqual({
        requestId: "req-1",
        success: true,
        ...result,
      });
    }
    expect("temp1" in window).toBe(false);
  });

  it("ignores the removed legacy storage protocol", async () => {
    const lookup = vi.fn();
    await loadInjectScript({
      stimulus: { getControllerForElementAndIdentifier: lookup },
    });
    script.dispatchEvent(
      new CustomEvent("hotwire-inspector:store-controller-request", {
        detail: JSON.stringify({
          selector: "#modal-controller",
          identifier: "modal",
          requestId: "req-1",
        }),
      }),
    );
    expect(lookup).not.toHaveBeenCalled();
    expect("temp1" in window).toBe(false);
  });

  it("does nothing when the script element is missing", async () => {
    Object.defineProperty(document, "currentScript", {
      configurable: true,
      get: () => null,
    });

    vi.stubGlobal("defineUnlistedScript", (setup) => setup());

    await expect(
      import("../../entrypoints/inspected-page-inject.js"),
    ).resolves.toBeDefined();
  });
});
