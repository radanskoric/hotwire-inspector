window.mainWorldFixture = { value: "page-owned-value" };
(() => {
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
    (event) => {
      const result = {
        ...JSON.parse(event.detail),
        addedGlobals: Object.getOwnPropertyNames(window).filter(
          (name) => !globals.includes(name),
        ),
        insertedScripts,
        scriptsUnchanged: scripts.length === document.scripts.length,
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
