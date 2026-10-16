import {
  MAIN_WORLD_RPC_REQUEST_EVENT,
  MAIN_WORLD_RPC_RESPONSE_EVENT,
} from "./constants.js";
import {
  parseRequest,
  parseResponse,
  validateStatus,
} from "./main_world/protocol.js";

/**
 * @typedef {object} PendingRequest
 * @property {import("./types.js").MainWorldRequest} request
 * @property {boolean} waiting
 * @property {(value: object) => void} resolve
 * @property {(error: Error) => void} reject
 * @property {ReturnType<typeof setTimeout>} timer
 */

export class MainWorldClient {
  /** @param {Document} document @param {Record<string, import("./types.js").MainWorldResultValidator>} [validators] */
  constructor(document, validators = {}) {
    this.document = document;
    this.validators = validators;
    /** @type {Map<string, PendingRequest>} */
    this.pending = new Map();
    /** @type {ReturnType<typeof setInterval> | null} */
    this.probeTimer = null;
    this.probeId = "";
    this.requestPrefix = crypto.getRandomValues(new Uint32Array(4)).join("-");
    this.sequence = 0;
    this.disconnected = false;
    this.listener = (/** @type {Event} */ event) =>
      this.receive(/** @type {CustomEvent} */ (event).detail);
    document.addEventListener(MAIN_WORLD_RPC_RESPONSE_EVENT, this.listener);
  }

  /** @param {string} operation @param {{selector?: string, identifier?: string}} [fields] @returns {Promise<object>} */
  request(operation, fields = {}) {
    if (this.disconnected)
      return Promise.reject(new Error("MAIN-world client disconnected"));
    const request = parseRequest(
      JSON.stringify({
        ...fields,
        version: 1,
        requestId: this.createRequestId(),
        operation,
      }),
    );
    if (!request)
      return Promise.reject(new Error("Invalid MAIN-world request"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.requestId);
        this.stopIdleProbes();
        reject(new Error("MAIN-world request timed out"));
      }, 5000);
      this.pending.set(request.requestId, {
        request,
        waiting: true,
        resolve,
        reject,
        timer,
      });
      if (this.probeTimer === null) {
        this.probeTimer = setInterval(() => this.probe(), 50);
        this.probe();
      }
    });
  }

  probe() {
    this.probeId = this.createRequestId();
    this.dispatch({
      version: 1,
      requestId: this.probeId,
      operation: "bridgeStatus",
    });
  }

  createRequestId() {
    return `${this.requestPrefix}-${this.sequence++}`;
  }

  /** @param {import("./types.js").MainWorldRequest} request */
  dispatch(request) {
    this.document.dispatchEvent(
      new CustomEvent(MAIN_WORLD_RPC_REQUEST_EVENT, {
        detail: JSON.stringify(request),
      }),
    );
  }

  /** @param {unknown} detail */
  receive(detail) {
    const response = parseResponse(detail, this.validators);
    if (!response) return;
    if (
      response.requestId === this.probeId &&
      response.operation === "bridgeStatus"
    ) {
      const status = validateStatus(response.result);
      for (const pending of this.pending.values()) {
        if (!pending.waiting) continue;
        if (pending.request.operation === "bridgeStatus") {
          this.settle(pending, response.result);
        } else if (status?.operations.includes(pending.request.operation)) {
          pending.waiting = false;
          this.dispatch(pending.request);
        }
      }
      this.stopIdleProbes();
      return;
    }
    const pending = this.pending.get(response.requestId);
    if (
      pending &&
      !pending.waiting &&
      pending.request.operation === response.operation
    )
      this.settle(pending, response.result);
  }

  /** @param {PendingRequest} pending @param {object} result */
  settle(pending, result) {
    clearTimeout(pending.timer);
    this.pending.delete(pending.request.requestId);
    pending.resolve(result);
  }

  stopIdleProbes() {
    if ([...this.pending.values()].some((pending) => pending.waiting)) return;
    if (this.probeTimer !== null) clearInterval(this.probeTimer);
    this.probeTimer = null;
    this.probeId = "";
  }

  disconnect() {
    if (this.disconnected) return;
    this.disconnected = true;
    this.document.removeEventListener(
      MAIN_WORLD_RPC_RESPONSE_EVENT,
      this.listener,
    );
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("MAIN-world client disconnected"));
    }
    this.pending.clear();
    this.stopIdleProbes();
  }
}
