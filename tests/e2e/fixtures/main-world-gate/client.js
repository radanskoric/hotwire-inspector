import { MainWorldClient } from "../../../../lib/main-world-client.js";
import { ContentInspector } from "../../../../lib/content-inspector.js";
import { validateStoredController } from "../../../../lib/main_world/controller-storage.js";
import {
  validateValueDefinitions,
  validateOutletDefinitions,
} from "../../../../lib/main_world/controller-definitions.js";

export function startGateClient(document) {
  // Observe the production isolated receiver at its port boundary in both browsers.
  new ContentInspector({
    document,
    connectPort: () => ({
      postMessage(push) {
        document.dispatchEvent(
          new CustomEvent("gate:turbo-push", { detail: JSON.stringify(push) }),
        );
      },
      onDisconnect: { addListener() {} },
      disconnect() {},
    }),
  });
  const fields = { selector: "#result", identifier: "fixture" };
  const client = new MainWorldClient(document, {
    storeController: validateStoredController,
    controllerValueDefinitions: validateValueDefinitions,
    controllerOutletDefinitions: validateOutletDefinitions,
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
        result = {
          ...result,
          definitions: await client.request(
            "controllerValueDefinitions",
            fields,
          ),
          outlets: await client.request("controllerOutletDefinitions", fields),
          failure: await client.request("controllerValueDefinitions", {
            ...fields,
            identifier: "broken",
          }),
          storage: await client.request("storeController", fields),
        };
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
    },
    { once: true },
  );
  document.addEventListener("gate:recheck", async () => {
    const definitions = await client.request(
      "controllerValueDefinitions",
      fields,
    );
    const outlets = await client.request("controllerOutletDefinitions", fields);
    document.dispatchEvent(
      new CustomEvent("gate:rechecked", {
        detail: JSON.stringify({ definitions, outlets }),
      }),
    );
  });
}
