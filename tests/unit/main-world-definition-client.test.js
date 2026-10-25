// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContentInspector } from "../../lib/content-inspector.js";
import {
  MAIN_WORLD_RPC_REQUEST_EVENT as REQUEST,
  MAIN_WORLD_RPC_RESPONSE_EVENT as RESPONSE,
} from "../../lib/constants.js";

let inspector, requests, listener;
const operations = [
  "controllerValueDefinitions",
  "controllerOutletDefinitions",
];
const results = [
  {
    success: true,
    definitions: [
      {
        name: "title",
        type: "object",
        attributeName: "data-modal-title-value",
        defaultValue: { nested: [null, true, 42] },
      },
    ],
  },
  { success: true, outlets: ["menu"] },
];
const send = ({ version, requestId, operation }, result, fields = {}) =>
  document.dispatchEvent(
    new CustomEvent(RESPONSE, {
      detail: JSON.stringify({
        version,
        requestId,
        operation,
        result,
        ...fields,
      }),
    }),
  );
const call = (index) =>
  inspector.mainWorldClient.request(operations[index], {
    selector: "#host",
    identifier: "modal",
  });
beforeEach(() => {
  vi.useFakeTimers();
  requests = [];
  listener = (event) => {
    expect(typeof event.detail).toBe("string");
    expect(event.bubbles).toBe(false);
    requests.push(JSON.parse(event.detail));
  };
  document.addEventListener(REQUEST, listener);
  inspector = new ContentInspector({ document });
});
afterEach(() => {
  inspector.disconnect();
  document.removeEventListener(REQUEST, listener);
  vi.useRealTimers();
});

it("shares readiness, correlates concurrent out-of-order replies, and exposes only operation results", async () => {
  const first = inspector.sendValueDefinitionsRequest({
    selector: "#host",
    identifier: "modal",
  });
  const second = inspector.sendOutletDefinitionsRequest({
    selector: "#host",
    identifier: "modal",
  });
  expect(requests).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(100);
  send(requests.at(-1), { success: true, operations });
  const actual = requests.filter((request) =>
    operations.includes(request.operation),
  );
  expect(actual).toHaveLength(2);
  send(actual[1], results[1]);
  send(actual[0], results[0]);
  expect(await first).toEqual(results[0]);
  expect(await second).toEqual(results[1]);
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(5000);
  expect(
    requests.filter((request) => operations.includes(request.operation)),
  ).toHaveLength(2);
});

it.each([0, 1])(
  "ignores malformed or mismatched definition replies until an exact response: %s",
  async (index) => {
    const promise = call(index);
    send(requests[0], { success: true, operations });
    const actual = requests.at(-1);
    for (const detail of ["{", "x".repeat(1048577), null])
      document.dispatchEvent(new CustomEvent(RESPONSE, { detail }));
    send(actual, results[index], { requestId: "wrong" });
    send(actual, results[1 - index], { operation: operations[1 - index] });
    send(actual, { ...results[index], requestId: actual.requestId });
    send(actual, { success: false, error: "x".repeat(4097) });
    send(actual, { success: false, error: 42 });
    if (index === 0) {
      send(actual, {
        success: true,
        definitions: [
          {
            ...results[0].definitions[0],
            defaultValue: JSON.parse('{"constructor":{}}'),
          },
        ],
      });
    } else send(actual, { success: true, outlets: [42] });
    expect(inspector.mainWorldClient.pending.size).toBe(1);
    send(actual, results[index]);
    expect(await promise).toEqual(results[index]);
    send(actual, { success: false, error: "late" });
    expect(inspector.mainWorldClient.pending.size).toBe(0);
  },
);

it.each([0, 1])(
  "bounds failure results for definition operation %s",
  async (index) => {
    const promise = call(index);
    send(requests[0], { success: true, operations });
    send(requests.at(-1), { success: false, error: "x".repeat(4096) });
    expect(await promise).toEqual({ success: false, error: "x".repeat(4096) });
  },
);

it("keeps independent five-second deadlines across readiness and response, and disconnects all operations", async () => {
  const first = call(0).catch((error) => error.message);
  await vi.advanceTimersByTimeAsync(1000);
  const second = call(1).catch((error) => error.message);
  send(requests.at(-1), { success: true, operations });
  await vi.advanceTimersByTimeAsync(4000);
  expect(await first).toBe("MAIN-world request timed out");
  expect(inspector.mainWorldClient.pending.size).toBe(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await second).toBe("MAIN-world request timed out");
  const pending = operations.map((_, index) =>
    call(index).catch((error) => error.message),
  );
  inspector.disconnect();
  expect(await Promise.all(pending)).toEqual([
    "MAIN-world client disconnected",
    "MAIN-world client disconnected",
  ]);
  expect(vi.getTimerCount()).toBe(0);
});
