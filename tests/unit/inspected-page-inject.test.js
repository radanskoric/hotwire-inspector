// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STORE_CONTROLLER_REQUEST_EVENT,
  STORE_CONTROLLER_RESPONSE_EVENT,
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
    script.addEventListener(STORE_CONTROLLER_RESPONSE_EVENT, (event) => {
      responseDetail = JSON.parse(event.detail);
    });

    script.dispatchEvent(
      new CustomEvent(STORE_CONTROLLER_REQUEST_EVENT, {
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
    script.addEventListener(STORE_CONTROLLER_RESPONSE_EVENT, (event) => {
      responseDetail = JSON.parse(event.detail);
    });

    script.dispatchEvent(
      new CustomEvent(STORE_CONTROLLER_REQUEST_EVENT, {
        detail: "not-json-and-not-an-object",
      }),
    );

    await flushMicrotasks();

    expect(responseDetail).not.toBeNull();
    expect(responseDetail.requestId).toBeNull();
    expect(responseDetail.success).toBe(false);
    expect(typeof responseDetail.error).toBe("string");
  });

  it("answers with a success response on the happy path", async () => {
    const controller = { identifier: "modal" };
    let storedAs = null;

    await loadInjectScript({
      stimulus: {
        getControllerForElementAndIdentifier: () => controller,
      },
    });

    let responseDetail = null;
    script.addEventListener(STORE_CONTROLLER_RESPONSE_EVENT, (event) => {
      responseDetail = JSON.parse(event.detail);
    });

    script.addEventListener(STORE_CONTROLLER_REQUEST_EVENT, (event) => {
      const detail = JSON.parse(event.detail);
      let index = 1;
      while (`temp${index}` in window) index += 1;
      storedAs = `temp${index}`;
      window[storedAs] = controller;
      script.dispatchEvent(
        new CustomEvent(STORE_CONTROLLER_RESPONSE_EVENT, {
          detail: JSON.stringify({
            requestId: detail.requestId,
            success: true,
            name: storedAs,
            identifier: "modal",
          }),
        }),
      );
    });

    script.dispatchEvent(
      new CustomEvent(STORE_CONTROLLER_REQUEST_EVENT, {
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
    expect(responseDetail).toMatchObject({
      success: true,
      identifier: "modal",
      name: storedAs,
    });
    expect(window[storedAs]).toBe(controller);
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
