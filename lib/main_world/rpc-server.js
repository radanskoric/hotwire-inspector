import {
  MAIN_WORLD_RPC_REQUEST_EVENT,
  MAIN_WORLD_RPC_RESPONSE_EVENT,
} from "../constants.js";
import { failure, parseRequest, validateResult } from "./protocol.js";

/** JSON document transport. Page scripts can spoof either endpoint. */
export class MainWorldRpcServer {
  /** @param {Document} document @param {Map<string, import("../types.js").MainWorldOperation>} operations */
  constructor(document, operations) {
    this.document = document;
    this.operations = operations;
    /** @type {EventListener | null} */
    this.listener = null;
  }

  start() {
    if (this.listener) return;
    const listener = (/** @type {Event} */ event) => {
      const request = parseRequest(/** @type {CustomEvent} */ (event).detail);
      if (request) void this.respond(request, listener);
    };
    this.listener = listener;
    this.document.addEventListener(MAIN_WORLD_RPC_REQUEST_EVENT, listener);
  }

  stop() {
    if (!this.listener) return;
    this.document.removeEventListener(
      MAIN_WORLD_RPC_REQUEST_EVENT,
      this.listener,
    );
    this.listener = null;
  }

  /** @param {import("../types.js").MainWorldRequest} request @param {EventListener} listener */
  async respond(request, listener) {
    const { version, requestId, operation } = request;
    let detail;
    try {
      let result;
      if (operation === "bridgeStatus") {
        result = { success: true, operations: [...this.operations.keys()] };
      } else {
        const registered = this.operations.get(operation);
        if (!registered) throw new Error("Operation unavailable");
        result = validateResult(
          await registered.handle(request),
          registered.validate,
          request,
        );
        if (!result) throw new Error("Invalid operation result");
      }
      detail = JSON.stringify({ version, requestId, operation, result });
      if (detail.length > 1024 * 1024) throw new Error("Response too large");
    } catch (error) {
      detail = JSON.stringify({
        version,
        requestId,
        operation,
        result: failure(error),
      });
    }
    if (this.listener === listener) {
      this.document.dispatchEvent(
        new CustomEvent(MAIN_WORLD_RPC_RESPONSE_EVENT, { detail }),
      );
    }
  }
}
