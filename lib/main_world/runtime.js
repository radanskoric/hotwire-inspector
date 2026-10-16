import { MAIN_WORLD_OPERATIONS } from "../constants.js";
import { MainWorldRpcServer } from "./rpc-server.js";
import { failure } from "./protocol.js";

/** Orchestrates document-lifetime features; construction has no page effects. */
export class MainWorldRuntime {
  /**
   * @param {Document} document
   * @param {import("../types.js").MainWorldFeatureFactory[]} factories
   */
  constructor(document, factories) {
    this.document = document;
    this.factories = factories;
    /** @type {Map<string, import("../types.js").MainWorldOperation>} */
    this.operations = new Map();
    this.server = new MainWorldRpcServer(document, this.operations);
    /** @type {import("../types.js").MainWorldFeature[]} */
    this.features = [];
    /** @type {{phase: string, error: string}[]} */
    this.diagnostics = [];
    this.started = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    for (const factory of this.factories) this.startFeature(factory);
    this.server.start();
  }

  /** @param {import("../types.js").MainWorldFeatureFactory} factory */
  startFeature(factory) {
    let feature;
    try {
      feature = factory(this.document);
    } catch (error) {
      this.diagnose("factory", error);
      return;
    }
    let entries;
    try {
      entries = Object.entries(feature.operations);
      for (const [name, operation] of entries) {
        if (
          name === "bridgeStatus" ||
          !MAIN_WORLD_OPERATIONS.includes(name) ||
          this.operations.has(name)
        ) {
          throw new Error(`Invalid or duplicate operation: ${name}`);
        }
        if (
          typeof operation.handle !== "function" ||
          typeof operation.validate !== "function"
        ) {
          throw new Error(`Missing handler or validator: ${name}`);
        }
      }
    } catch (error) {
      this.diagnose("registration", error);
      return;
    }
    try {
      feature.start();
    } catch (error) {
      this.diagnose("start", error);
      this.stopFeature(feature);
      return;
    }
    this.features.push(feature);
    for (const [name, operation] of entries) {
      this.operations.set(name, operation);
    }
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.server.stop();
    for (const feature of this.features) this.stopFeature(feature);
    this.features = [];
    this.operations.clear();
  }

  /** @param {import("../types.js").MainWorldFeature} feature */
  stopFeature(feature) {
    try {
      feature.stop();
    } catch (error) {
      this.diagnose("stop", error);
    }
  }

  /** @param {string} phase @param {unknown} error */
  diagnose(phase, error) {
    this.diagnostics.push({ phase, error: failure(error).error });
  }
}
