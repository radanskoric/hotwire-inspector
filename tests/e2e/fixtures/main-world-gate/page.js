window.mainWorldFixture = {
  value: "page-owned-value",
  controller: {
    identifier: "fixture",
    valueDescriptorMap: {
      "data-fixture-options-value": {
        name: "optionsValue",
        type: "object",
        defaultValue: { enabled: true, items: [1, null] },
      },
    },
    constructor: { outlets: ["menu", 1, "status"] },
  },
  broken: {
    get valueDescriptorMap() {
      throw new Error("fixture getter failed");
    },
  },
};
window[new URL(location.href).searchParams.get("application") || "Stimulus"] = {
  getControllerForElementAndIdentifier(element, identifier) {
    if (identifier === "broken") return window.mainWorldFixture.broken;
    return element === document.getElementById("result") &&
      identifier === "fixture"
      ? window.mainWorldFixture.controller
      : null;
  },
};
(() => {
  const responses = new Map();
  document.addEventListener(
    "hotwire-inspector:main-world-rpc-response",
    (event) => {
      const { requestId } = JSON.parse(event.detail);
      responses.set(requestId, (responses.get(requestId) || 0) + 1);
    },
  );
  const globals = Object.getOwnPropertyNames(window);
  const scripts = [...document.scripts];
  let insertedScripts = 0;
  const observer = new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes) {
        if (node.nodeName === "SCRIPT") insertedScripts += 1;
      }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  document.addEventListener(
    "gate:result",
    async (event) => {
      const response = JSON.parse(event.detail);
      const turbo = await checkTurboCapture();
      const result = {
        ...response,
        turbo,
        storedControllerMatches:
          window[response.storage?.name] === window.mainWorldFixture.controller,
        addedGlobals: Object.getOwnPropertyNames(window).filter(
          (name) => !globals.includes(name) && name !== response.storage?.name,
        ),
        insertedScripts,
        scriptsUnchanged: scripts.length === document.scripts.length,
        oneResponsePerRequest: [...responses.values()].every(
          (count) => count === 1,
        ),
        userAgent: navigator.userAgent,
        order: location.search,
      };
      document.querySelector("#result").textContent = JSON.stringify(result);
      observer.disconnect();
      // A local collector lets an installed Firefox extension report without DevTools automation.
      void fetch("/gate-result", {
        method: "POST",
        body: JSON.stringify(result),
      });
    },
    { once: true },
  );
  document.dispatchEvent(new Event("gate:run"));
  if (location.search.includes("client-first"))
    setTimeout(() => document.dispatchEvent(new Event("gate:start")), 120);
})();

// Synthetic Turbo-shaped events, using real page-owned incoming Elements.
async function checkTurboCapture() {
  const target = document.querySelector("#result");
  const incoming = document.createElement("turbo-frame");
  incoming.id = "incoming";
  incoming.setAttribute("src", "/partial");
  incoming.innerHTML = '<p title="snapshot">page &amp; content</p>';
  const html = incoming.outerHTML;
  const pushes = [];
  const receive = (event) => pushes.push(JSON.parse(event.detail));
  document.addEventListener("gate:turbo-push", receive);
  const seen = [];
  let source;
  const observe = (event) =>
    seen.push(event === source && event.detail.newFrame === incoming);
  document.addEventListener("turbo:before-frame-render", observe, true);
  target.addEventListener("turbo:before-frame-render", observe);
  document.addEventListener("turbo:before-frame-render", observe);
  const timestamp = Date.now();
  source = new CustomEvent("turbo:before-frame-render", {
    bubbles: true,
    cancelable: true,
    detail: { newFrame: incoming },
  });
  const dispatchResult = target.dispatchEvent(source);
  const defaultUnchanged = !source.defaultPrevented;
  incoming.textContent = "mutated after dispatch";
  const cancel = (event) => event.preventDefault();
  target.addEventListener("turbo:before-frame-render", cancel, { once: true });
  source = new CustomEvent("turbo:before-frame-render", {
    bubbles: true,
    cancelable: true,
    detail: { newFrame: incoming },
  });
  const cancelledResult = target.dispatchEvent(source);
  document.removeEventListener("turbo:before-frame-render", observe, true);
  target.removeEventListener("turbo:before-frame-render", observe);
  document.removeEventListener("turbo:before-frame-render", observe);
  target.dispatchEvent(
    new CustomEvent("turbo:before-frame-render", { bubbles: true }),
  );
  incoming.textContent = "x".repeat(65536);
  target.dispatchEvent(
    new CustomEvent("turbo:before-frame-render", {
      bubbles: true,
      detail: { newFrame: incoming },
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  document.removeEventListener("gate:turbo-push", receive);
  return {
    early: window.earlyTurboGate,
    count: pushes.length,
    snapshot: pushes[0]?.details.html === html,
    fields:
      pushes[0]?.details.newFrameSrc === "/partial" &&
      pushes[0]?.details.newFrameId === "incoming",
    target: pushes.every((push) => push.targetId === "result"),
    timestamp: pushes.every(
      (push) => Math.abs(push.timestamp - timestamp) < 1000,
    ),
    empty: JSON.stringify(pushes[2]?.details) === "{}",
    oversized:
      pushes[3]?.details.htmlError ===
        "HTML omitted: exceeds 65536 code units" &&
      !Object.hasOwn(pushes[3].details, "html"),
    sourceSafety:
      seen.length === 6 &&
      seen.every(Boolean) &&
      dispatchResult &&
      defaultUnchanged &&
      !cancelledResult &&
      source.defaultPrevented,
  };
}
