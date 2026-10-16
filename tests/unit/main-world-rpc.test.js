// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MainWorldRuntime } from "../../lib/main_world/runtime.js";
import { MainWorldRpcServer } from "../../lib/main_world/rpc-server.js";
import { MainWorldClient } from "../../lib/main-world-client.js";
import {
  parseRequest,
  parseResponse,
  validateStatus,
  failure,
} from "../../lib/main_world/protocol.js";
import {
  MAIN_WORLD_RPC_REQUEST_EVENT as REQUEST,
  MAIN_WORLD_RPC_RESPONSE_EVENT as RESPONSE,
} from "../../lib/constants.js";

const validate = (value) =>
  value?.success === true &&
  typeof value.value === "string" &&
  Object.keys(value).length === 2
    ? { success: true, value: value.value }
    : null;
let client, runtime, requests;
const recordRequest = (event) => requests.push(parseRequest(event.detail));
const request = (operation = "storeController") =>
  client.request(operation, { selector: "#host", identifier: "hello" });
const envelope = (operation = "bridgeStatus") => ({
  version: 1,
  requestId: "id",
  operation,
});
const send = (name, value) =>
  document.dispatchEvent(
    new CustomEvent(name, {
      detail: typeof value === "string" ? value : JSON.stringify(value),
    }),
  );
beforeEach(() => {
  vi.useFakeTimers();
  requests = [];
  document.addEventListener(REQUEST, recordRequest);
  client = new MainWorldClient(document, { storeController: validate });
  runtime = new MainWorldRuntime(document, [
    () => ({
      start() {},
      stop() {},
      operations: {
        storeController: {
          validate,
          handle: () => ({ success: true, value: "ok" }),
        },
      },
    }),
  ]);
});
afterEach(() => {
  client.disconnect();
  runtime.stop();
  document.removeEventListener(REQUEST, recordRequest);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("works on HTTP contexts without crypto.randomUUID", async () => {
  client.disconnect();
  vi.stubGlobal("crypto", {
    getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
  });
  client = new MainWorldClient(document, { storeController: validate });
  runtime.start();
  await expect(request()).resolves.toEqual({ success: true, value: "ok" });
});

it("returns a validated failure to explicit status callers", async () => {
  const result = client.request("bridgeStatus");
  const probe = requests[0];
  send(RESPONSE, {
    ...probe,
    result: { success: false, error: "Status unavailable" },
  });
  await expect(result).resolves.toEqual({
    success: false,
    error: "Status unavailable",
  });
  expect(vi.getTimerCount()).toBe(0);
});

it.each([true, false])(
  "supports both startup orders (server first: %s) without retrying operations",
  async (serverFirst) => {
    const listener = (event) => {
      expect(event.bubbles).toBe(false);
    };
    document.addEventListener(REQUEST, listener);
    if (serverFirst) runtime.start();
    const result = request();
    if (!serverFirst) {
      runtime.start();
      await vi.advanceTimersByTimeAsync(50);
    }
    await expect(result).resolves.toEqual({ success: true, value: "ok" });
    await vi.advanceTimersByTimeAsync(200);
    expect(
      requests.filter((item) => item.operation === "storeController"),
    ).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    document.removeEventListener(REQUEST, listener);
  },
);

it("shares probes, stops on last dispatch and correlates out-of-order replies", async () => {
  const first = request();
  const second = request();
  await vi.advanceTimersByTimeAsync(100);
  expect(requests).toHaveLength(3);
  send(RESPONSE, {
    ...requests.at(-1),
    result: { success: true, operations: ["storeController"] },
  });
  const actual = requests.filter(
    (item) => item.operation === "storeController",
  );
  expect(actual).toHaveLength(2);
  expect(vi.getTimerCount()).toBe(2);
  send(RESPONSE, {
    ...actual[1],
    selector: undefined,
    identifier: undefined,
    result: { success: true, value: "second" },
  });
  send(RESPONSE, {
    ...actual[0],
    selector: undefined,
    identifier: undefined,
    result: { success: true, value: "first" },
  });
  await expect(first).resolves.toEqual({ success: true, value: "first" });
  await expect(second).resolves.toEqual({ success: true, value: "second" });
});

it("keeps independent readiness deadlines and removes expired waiters", async () => {
  const first = request().catch((error) => error.message);
  await vi.advanceTimersByTimeAsync(1000);
  const second = request().catch((error) => error.message);
  await vi.advanceTimersByTimeAsync(4000);
  expect(await first).toMatch(/timed out/);
  expect(client.pending.size).toBe(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await second).toMatch(/timed out/);
  expect(vi.getTimerCount()).toBe(0);
});

it("returns status and times out for a missing feature", async () => {
  runtime.factories = [];
  runtime.start();
  await expect(client.request("bridgeStatus")).resolves.toEqual({
    success: true,
    operations: [],
  });
  const result = request().catch((error) => error.message);
  await vi.advanceTimersByTimeAsync(5000);
  expect(await result).toMatch(/timed out/);
  expect(vi.getTimerCount()).toBe(0);
});

it("ignores malformed, unknown and mismatched responses until the response deadline", async () => {
  const result = request().catch((error) => error.message);
  const probe = requests[0];
  send(RESPONSE, {
    ...probe,
    requestId: "wrong",
    result: { success: true, operations: ["storeController"] },
  });
  send(RESPONSE, {
    ...probe,
    operation: "storeController",
    result: { success: true, value: "wrong" },
  });
  send(RESPONSE, "{");
  send(RESPONSE, {
    ...probe,
    result: { success: false, error: "retry readiness" },
  });
  send(RESPONSE, {
    ...probe,
    result: { success: true, operations: ["storeController"] },
  });
  const actual = requests.at(-1);
  send(RESPONSE, {
    version: 1,
    requestId: actual.requestId,
    operation: actual.operation,
    result: { success: true, value: 42 },
  });
  await vi.advanceTimersByTimeAsync(5000);
  expect(await result).toMatch(/timed out/);
});

it("disconnect rejects outstanding and future requests and clears timers/listeners", async () => {
  const result = request().catch((error) => error.message);
  const remove = vi.spyOn(document, "removeEventListener");
  client.disconnect();
  client.disconnect();
  expect(await result).toMatch(/disconnected/);
  await expect(request()).rejects.toThrow(/disconnected/);
  expect(vi.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalledTimes(1);
});

it.each([
  () => {
    throw new Error("x".repeat(5000));
  },
  () => {
    throw null;
  },
  () => ({ success: true, value: 2 }),
  () => ({ success: false, error: "failure" }),
])("contains handler failures", async (handle) => {
  runtime.start();
  runtime.operations.set("storeController", { handle, validate });
  const result = await request();
  expect(result.success).toBe(false);
  expect(typeof result.error).toBe("string");
  expect(result.error.length).toBeLessThanOrEqual(4096);
});

it("rejects invalid local requests without dispatch", async () => {
  await expect(client.request("eval")).rejects.toThrow(/Invalid/);
  await expect(client.request("storeController")).rejects.toThrow(/Invalid/);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  null,
  [],
  1,
  "",
  "{",
  "x".repeat(131073),
  JSON.stringify({ ...envelope(), extra: 1 }),
  JSON.stringify({ ...envelope(), version: 2 }),
  JSON.stringify({ ...envelope(), requestId: "" }),
  JSON.stringify({ ...envelope(), requestId: "x".repeat(129) }),
  JSON.stringify(envelope("eval")),
  JSON.stringify({ ...envelope(), selector: "x" }),
  JSON.stringify(envelope("storeController")),
  JSON.stringify({
    ...envelope("storeController"),
    selector: "x".repeat(16385),
    identifier: "x",
  }),
  JSON.stringify({
    ...envelope("storeController"),
    selector: "x",
    identifier: "x".repeat(1025),
  }),
])("rejects invalid request detail %#", (value) => {
  expect(parseRequest(value)).toBeNull();
});

it("reconstructs only approved request fields", () => {
  expect(parseRequest("null")).toBeNull();
  expect(parseRequest(JSON.stringify(envelope()))).toEqual(envelope());
  const value = {
    ...envelope("storeController"),
    selector: "#host",
    identifier: "hello",
  };
  expect(parseRequest(JSON.stringify(value))).toEqual(value);
});

it.each([
  null,
  {},
  { success: true, operations: ["eval"] },
  { success: true, operations: [1] },
  { success: true, operations: [], extra: 1 },
  { success: false, error: "x".repeat(4097) },
  { success: false, error: 1 },
])("rejects invalid status/result %#", (result) => {
  expect(
    parseResponse(JSON.stringify({ ...envelope(), result }), {}),
  ).toBeNull();
});

it("validates failure for all operations and refuses unregistered success validators", () => {
  expect(
    validateStatus({ success: true, operations: ["storeController"] }),
  ).toEqual({ success: true, operations: ["storeController"] });
  expect(failure(new Error("message"))).toEqual({
    success: false,
    error: "message",
  });
  for (const operation of ["bridgeStatus", "storeController"]) {
    const response = {
      ...envelope(operation),
      result: { success: false, error: "failure" },
    };
    expect(parseResponse(JSON.stringify(response), {})).toEqual(response);
  }
  expect(
    parseResponse(
      JSON.stringify({
        ...envelope("storeController"),
        result: { success: true },
      }),
      {},
    ),
  ).toBeNull();
  expect(parseResponse("x".repeat(1048577), {})).toBeNull();
  expect(
    parseResponse(
      JSON.stringify({ ...envelope(), result: {}, extra: true }),
      {},
    ),
  ).toBeNull();
});

it("contains a throwing result validator", () => {
  expect(
    parseResponse(
      JSON.stringify({
        ...envelope("storeController"),
        result: { success: true },
      }),
      {
        storeController: () => {
          throw new Error("bad validator");
        },
      },
    ),
  ).toBeNull();
});

it("bounds failures even when a thrown Error has a hostile message", () => {
  const numeric = new Error();
  numeric.message = 42;
  const hostile = new Error();
  Object.defineProperty(hostile, "message", {
    get() {
      throw new Error("getter");
    },
  });
  expect(failure(numeric)).toEqual({
    success: false,
    error: "MAIN-world operation failed",
  });
  expect(failure(hostile)).toEqual({
    success: false,
    error: "MAIN-world operation failed",
  });
});

it("ignores already dispatched requests in later status probes", async () => {
  const first = request().catch((error) => error.message);
  const second = request("controllerOutletDefinitions").catch(
    (error) => error.message,
  );
  const probe = requests[0];
  send(RESPONSE, {
    ...probe,
    result: { success: true, operations: ["storeController"] },
  });
  send(RESPONSE, {
    ...probe,
    result: { success: true, operations: ["storeController"] },
  });
  const actual = requests.filter(
    (item) => item.operation === "storeController",
  );
  expect(actual).toHaveLength(1);
  client.disconnect();
  expect(await first).toMatch(/disconnected/);
  expect(await second).toMatch(/disconnected/);
});

it("server start/stop is idempotent, ignores invalid requests, and reports unavailable operations", async () => {
  const server = new MainWorldRpcServer(document, new Map());
  const responses = [];
  const listener = (event) => responses.push(JSON.parse(event.detail));
  document.addEventListener(RESPONSE, listener);
  server.start();
  server.start();
  send(REQUEST, "{");
  expect(responses).toEqual([]);
  send(REQUEST, {
    ...envelope("storeController"),
    selector: "#host",
    identifier: "hello",
  });
  expect(responses[0].result).toEqual({
    success: false,
    error: "Operation unavailable",
  });
  server.stop();
  server.stop();
  send(REQUEST, envelope());
  expect(responses).toHaveLength(1);
  document.removeEventListener(RESPONSE, listener);
});

it.each([
  () => ({ success: true, value: "x".repeat(1048576) }),
  () => {
    const value = { success: true };
    value.self = value;
    return value;
  },
])("contains oversized and unserializable results", async (handle) => {
  runtime.start();
  runtime.operations.set("storeController", {
    handle,
    validate: (value) => value,
  });
  const result = await request();
  expect(result.success).toBe(false);
  expect(typeof result.error).toBe("string");
});

it("drops asynchronous responses after server teardown even after restarting", async () => {
  let finish;
  runtime.start();
  runtime.operations.set("storeController", {
    handle: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    validate,
  });
  const result = request().catch((error) => error.message);
  runtime.stop();
  runtime.start();
  finish({ success: true, value: "late" });
  await vi.advanceTimersByTimeAsync(5000);
  expect(await result).toMatch(/timed out/);
});
