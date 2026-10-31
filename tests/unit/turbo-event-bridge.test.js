import { expect, it } from "vitest";
import { parseMainWorldTurboEvent } from "../../lib/turbo-event-bridge.js";

const record = (details = {}, timestamp = 1700000000000) => ({
  name: "turbo:before-frame-render",
  timestamp,
  details,
});
const parse = (value) => parseMainWorldTurboEvent(JSON.stringify(value));

it("reconstructs fresh records and accepts exact boundaries and escaped expansion", () => {
  for (const timestamp of [1000000000000, 9999999999999]) {
    const value = record(
      {
        newFrameSrc: "\u0000".repeat(8192),
        newFrameId: "\u0001".repeat(8192),
        html: "\u0002".repeat(65536),
        detailsError: "e".repeat(256),
      },
      timestamp,
    );
    const result = parse(value);
    expect(JSON.stringify(value).length).toBeGreaterThan(65536);
    expect(result).toEqual(value);
  }
  expect(parse(record({ htmlError: "e".repeat(256) }))).not.toBeNull();
  expect(parse(record())).toEqual(record());
});

it.each([null, 1, {}, [], "{", " ".repeat(524289)])(
  "rejects invalid raw input %#",
  (raw) => {
    expect(parseMainWorldTurboEvent(raw)).toBeNull();
  },
);

it.each([
  null,
  [],
  2,
  { ...record(), extra: 1 },
  { timestamp: 1700000000000, details: {} },
  { name: "turbo:before-frame-render", timestamp: 1700000000000, unknown: {} },
  { ...record(), name: "turbo:load" },
  { ...record(), name: null },
  ...[null, "1700000000000", 999999999999, 10000000000000].map((timestamp) =>
    record({}, timestamp),
  ),
  ...[
    null,
    [],
    1,
    { unknown: "x" },
    { constructor: "x" },
    { prototype: "x" },
    { html: 1 },
    { html: [] },
    { html: {} },
    { html: null },
    { html: "", htmlError: "" },
    { newFrameSrc: "x".repeat(8193) },
    { newFrameId: "x".repeat(8193) },
    { html: "x".repeat(65537) },
    { htmlError: "x".repeat(257) },
    { detailsError: "x".repeat(257) },
  ].map((details) => record(details)),
])("rejects malformed or unowned records %#", (value) => {
  expect(parse(value)).toBeNull();
});

it("rejects prototype keys and accepts the raw size boundary", () => {
  expect(
    parseMainWorldTurboEvent(
      '{"name":"turbo:before-frame-render","timestamp":1700000000000,"details":{"__proto__":"x"}}',
    ),
  ).toBeNull();
  const raw = JSON.stringify(record());
  expect(parseMainWorldTurboEvent(raw.padEnd(524288))).toEqual(record());
});
