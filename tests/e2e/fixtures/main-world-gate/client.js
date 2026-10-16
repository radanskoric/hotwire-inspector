import { MainWorldClient } from "../../../../lib/main-world-client.js";

export function startGateClient(document) {
  const client = new MainWorldClient(document, {
    fixtureRead: (value) =>
      value?.success === true && value.value === "page-owned-value"
        ? { success: true, value: value.value }
        : null,
  });
  document.addEventListener(
    "gate:run",
    async () => {
      let result;
      try {
        result = await client.request("fixtureRead", {
          selector: "body",
          identifier: "fixture",
        });
      } catch (error) {
        result = { success: false, error: error.message };
      }
      document.dispatchEvent(
        new CustomEvent("gate:result", {
          detail: JSON.stringify({
            ...result,
            isolated: typeof window.mainWorldFixture === "undefined",
          }),
        }),
      );
      client.disconnect();
    },
    { once: true },
  );
}
