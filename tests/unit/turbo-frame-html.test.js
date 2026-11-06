// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import {
  TURBO_EVENT_NAMES,
  MAIN_WORLD_TURBO_EVENT_NAMES,
  ISOLATED_WORLD_TURBO_EVENT_NAMES,
  turboEventDetailsFor,
  TurboEventWatcher,
} from "../../lib/turbo-event-watcher.js";

const name = "turbo:before-frame-render";
const extract = (frame) =>
  turboEventDetailsFor(name, { detail: { newFrame: frame } });

it("partitions the full registry into exclusive owners", () => {
  expect(MAIN_WORLD_TURBO_EVENT_NAMES).toEqual([name]);
  expect(Object.isFrozen(MAIN_WORLD_TURBO_EVENT_NAMES)).toBe(true);
  expect(
    ISOLATED_WORLD_TURBO_EVENT_NAMES.some((item) =>
      MAIN_WORLD_TURBO_EVENT_NAMES.includes(item),
    ),
  ).toBe(false);
  expect(
    [
      ...MAIN_WORLD_TURBO_EVENT_NAMES,
      ...ISOLATED_WORLD_TURBO_EVENT_NAMES,
    ].sort(),
  ).toEqual([...TURBO_EVENT_NAMES].sort());
});

it("snapshots a real incoming frame with its src and id", () => {
  const frame = document.createElement("turbo-frame");
  frame.id = "incoming";
  frame.setAttribute("src", "/partial");
  frame.innerHTML = '<p title="hello">incoming &amp; content</p>';
  const html = frame.outerHTML;
  const details = extract(frame);
  frame.textContent = "changed";
  expect(details).toEqual({
    newFrameSrc: "/partial",
    newFrameId: "incoming",
    html,
  });
});

it("captures the exact HTML boundary and truncates larger HTML", () => {
  const frame = document.createElement("turbo-frame");
  frame.textContent = "x".repeat(65536 - frame.outerHTML.length);
  expect(extract(frame)).toEqual({ html: frame.outerHTML });
  frame.append("x");
  expect(extract(frame)).toEqual({
    html: frame.outerHTML.slice(0, 65536),
    htmlOriginalLength: String(frame.outerHTML.length),
  });
});

it("bounds scalar fields independently with an explanation", () => {
  const frame = document.createElement("turbo-frame");
  frame.id = "i".repeat(8192);
  frame.setAttribute("src", "s".repeat(8192));
  expect(extract(frame)).toMatchObject({
    newFrameId: frame.id,
    newFrameSrc: frame.getAttribute("src"),
  });
  frame.id += "i";
  frame.setAttribute("src", "s".repeat(8193));
  const result = extract(frame);
  expect(result.newFrameId).toBeUndefined();
  expect(result.newFrameSrc).toBeUndefined();
  expect(result.detailsError).toBe(
    "Fields omitted: newFrameSrc, newFrameId exceed 8192 code units",
  );
});

it.each([undefined, null, {}, { id: 1, outerHTML: 2 }, "frame"])(
  "ignores absent and malformed fields: %j",
  (frame) => {
    expect(extract(frame)).toEqual({});
  },
);

it.each(["newFrame", "src", "id", "outerHTML"])(
  "contains a throwing %s getter and continues capturing without cancelling",
  (field) => {
    const onEvent = vi.fn();
    const watcher = new TurboEventWatcher({
      document,
      eventNames: [name],
      onEvent,
    });
    const frame = document.createElement("turbo-frame");
    const detail = { newFrame: frame };
    const fail = () => {
      throw new Error("page getter");
    };
    if (field === "newFrame")
      Object.defineProperty(detail, field, { get: fail });
    else if (field === "src") frame.getAttribute = fail;
    else Object.defineProperty(frame, field, { get: fail });
    const broken = new CustomEvent(name, {
      detail,
      cancelable: true,
    });
    watcher.start();
    expect(document.dispatchEvent(broken)).toBe(true);
    expect(broken.defaultPrevented).toBe(false);
    document.dispatchEvent(new Event(name));
    expect(onEvent).toHaveBeenCalledTimes(1);
    watcher.stop();
  },
);

it.each([
  ["😀", 65536],
  ["a😀", 65535],
  ["ab😀", 65536],
])("preserves Unicode at the cutoff: %s", (ending, retainedLength) => {
  const html = "x".repeat(65534) + ending + "tail";
  const result = extract({ outerHTML: html });
  expect(result.html).toBe(html.slice(0, retainedLength));
  expect(result.htmlOriginalLength).toBe(String(html.length));
});
