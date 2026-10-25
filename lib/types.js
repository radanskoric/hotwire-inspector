/**
 * Shared JSDoc type definitions for the Hotwire Inspector messaging
 * boundaries: panel ↔ background script ↔ content script ↔ inspected page.
 *
 * This module has no runtime exports. Reference a type from another file with
 * `import("./types.js").TypeName` (adjust the relative path as needed).
 */

export {};

/**
 * @typedef {{version: 1, requestId: string, operation: string, selector?: string, identifier?: string}} MainWorldRequest
 * @typedef {{success: false, error: string}} MainWorldFailure
 * @typedef {{success: true, operations: string[]}} MainWorldStatus
 * @typedef {{version: 1, requestId: string, operation: string, result: object}} MainWorldResponse
 * @typedef {(value: unknown, request?: MainWorldRequest) => object | null} MainWorldResultValidator
 * @typedef {{handle: (request: MainWorldRequest) => unknown, validate: MainWorldResultValidator}} MainWorldOperation
 * @typedef {{start: () => void, stop: () => void, operations: Record<string, MainWorldOperation>}} MainWorldFeature
 * @typedef {(document: Document) => MainWorldFeature} MainWorldFeatureFactory
 */

/**
 * A Stimulus target found inside an inspected element.
 *
 * @typedef {object} ScanTarget
 * @property {string} controller - identifier of the controller defining the target
 * @property {string} name - target name
 */

/**
 * Minimal port interface matching `runtime.Port` structure.
 *
 * @typedef {object} PortLike
 * @property {any} onMessage
 * @property {any} onDisconnect
 * @property {(message: any) => void} postMessage
 * @property {() => void} disconnect
 */

/**
 * One inspectable element (turbo-frame or Stimulus controller host) reported
 * by the content script scan.
 *
 * @typedef {object} ScanItem
 * @property {string} id - key identifying the element in later messages
 * @property {string | null} parentId - id of the parent item, or null for roots
 * @property {string} tagName - lowercase tag name of the element
 * @property {string[]} controllers - Stimulus controller identifiers declared on the element
 * @property {string | null} [src] - `src` attribute, only set for turbo-frames
 * @property {ScanTarget[]} [targets] - Stimulus targets contained in the element
 */

/**
 * A scan item arranged into a tree by `buildTree`.
 *
 * @typedef {ScanItem & { children: TreeNode[] }} TreeNode
 */

/**
 * Ask the content script to scan the inspected page.
 * Answered with a ScanResponse.
 *
 * @typedef {object} ScanRequest
 * @property {import("./constants.js").CONTENT_SCAN_MESSAGE_TYPE} type
 */

/**
 * @typedef {object} ScanResponse
 * @property {ScanItem[]} items
 */

/**
 * Ask the content script to highlight an element.
 * Answered with a HighlightResponse.
 *
 * @typedef {object} HighlightRequest
 * @property {import("./constants.js").CONTENT_HIGHLIGHT_MESSAGE_TYPE} type
 * @property {string} id
 */

/**
 * Ask the content script to remove the highlight overlay.
 * Answered with a HighlightResponse.
 *
 * @typedef {object} ClearHighlightRequest
 * @property {import("./constants.js").CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE} type
 */

/**
 * @typedef {object} HighlightResponse
 * @property {boolean} success
 */

/**
 * Ask the content script for a CSS selector usable with `inspect()`.
 *
 * @typedef {object} InspectRequest
 * @property {import("./constants.js").CONTENT_INSPECT_MESSAGE_TYPE} type
 * @property {string} id
 */

/**
 * @typedef {object} InspectResponse
 * @property {boolean} success
 * @property {string | null} selector - CSS selector for the element, when found
 */

/**
 * Ask the content script to expose a Stimulus controller instance on the
 * inspected page's `window`.
 *
 * @typedef {object} StoreControllerRequest
 * @property {import("./constants.js").CONTENT_STORE_CONTROLLER_MESSAGE_TYPE} type
 * @property {string} id
 * @property {string} identifier
 */

/**
 * @typedef {{ success: true, name: string, identifier: string } | { success: false, error: string }} StoreControllerResponse
 */

/**
 * The declaration of a single Stimulus value, as detected by the MAIN
 * service from the controller instance. Definitions change rarely (only
 * when the controller class or element change), so they are fetched once and
 * the current value is resolved separately from the DOM attribute.
 *
 * @typedef {object} ControllerValueDefinition
 * @property {string} name - value name as declared (e.g. "contentType")
 * @property {string} type - normalized value type, e.g. "string", "number", "boolean", "object", "array"
 * @property {any} defaultValue - the Stimulus default for the value
 * @property {string} attributeName - backing attribute (e.g. "data-modal-title-value")
 */

/**
 * A single Stimulus value of an inspected controller instance: its
 * definition plus the current raw attribute string read by the content
 * script off the DOM element.
 *
 * @typedef {object} ControllerValue
 * @property {string} name - value name as declared (e.g. "contentType")
 * @property {string} type - normalized value type, e.g. "string", "number", "boolean", "object", "array"
 * @property {string | null} value - raw attribute value, or null when the attribute is unset
 * @property {any} defaultValue - the Stimulus default for the value
 * @property {boolean} hasValue - whether the backing `data-*-value` attribute is present on the element
 */

/**
 * Ask the content script for the Stimulus values of a controller instance.
 * Answered with a ControllerValuesResponse.
 *
 * @typedef {object} ControllerValuesRequest
 * @property {import("./constants.js").CONTENT_CONTROLLER_VALUES_MESSAGE_TYPE} type
 * @property {string} id
 * @property {string} identifier
 */

/**
 * @typedef {{ success: true, values: ControllerValue[] } | { success: false, error: string }} ControllerValuesResponse
 */

/**
 * A single Stimulus target of an inspected controller instance.
 *
 * @typedef {object} ControllerTargetEntry
 * @property {string} id - element key usable for further selectors/inspect calls
 * @property {string} tagName - lowercase tag name of the target element
 * @property {string} name - target name as declared on the host element (e.g. "closeButton")
 */

/**
 * Ask the content script for the Stimulus targets of a controller instance.
 * Answered with a ControllerTargetsResponse.
 *
 * @typedef {object} ControllerTargetsRequest
 * @property {import("./constants.js").CONTENT_CONTROLLER_TARGETS_MESSAGE_TYPE} type
 * @property {string} id
 * @property {string} identifier
 */

/**
 * @typedef {{ success: true, targets: ControllerTargetEntry[] } | { success: false, error: string }} ControllerTargetsResponse
 */

/**
 * A single Stimulus outlet of an inspected controller instance.
 *
 * @typedef {object} ControllerOutletEntry
 * @property {string} id - element key usable for further selectors/inspect calls
 * @property {string} tagName - lowercase tag name of the outlet element
 * @property {string} name - outlet name; the outlet controller's identifier
 */

/**
 * Ask the content script for the Stimulus outlets of a controller instance.
 * Answered with a ControllerOutletsResponse.
 *
 * @typedef {object} ControllerOutletsRequest
 * @property {import("./constants.js").CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE} type
 * @property {string} id
 * @property {string} identifier
 */

/**
 * @typedef {{ success: true, outlets: ControllerOutletEntry[] } | { success: false, error: string }} ControllerOutletsResponse
 */

/**
 * Answered by the MAIN service with the outlet declarations of a
 * controller instance (the names of outlets declared on the controller class).
 *
 * @typedef {{ success: true, outlets: string[] } | { success: false, error: string }} ControllerOutletDefinitionsResponse
 */

/**
 * Answered by the MAIN service with the value declarations of a
 * controller instance.
 *
 * @typedef {{ success: true, definitions: ControllerValueDefinition[] } | { success: false, error: string }} ControllerValueDefinitionsResponse
 */

/**
 * Ask the content script to start watching a controller's values for changes.
 * Answered with a WatchValuesResponse.
 *
 * @typedef {object} WatchValuesRequest
 * @property {import("./constants.js").CONTENT_WATCH_VALUES_MESSAGE_TYPE} type
 * @property {string} id
 * @property {string} identifier
 */

/**
 * @typedef {{ success: true } | { success: false, error: string }} WatchValuesResponse
 */

/**
 * Ask the content script to stop watching a controller's values.
 * Answered with an UnwatchValuesResponse.
 *
 * @typedef {object} UnwatchValuesRequest
 * @property {import("./constants.js").CONTENT_UNWATCH_VALUES_MESSAGE_TYPE} type
 */

/**
 * @typedef {{ success: true }} UnwatchValuesResponse
 */

/**
 * Any request the panel can send to the content script.
 *
 * @typedef {ScanRequest | HighlightRequest | ClearHighlightRequest | InspectRequest | StoreControllerRequest | ControllerValuesRequest | ControllerTargetsRequest | ControllerOutletsRequest | WatchValuesRequest | UnwatchValuesRequest} ContentRequest
 */

/**
 * Envelope used to relay a ContentRequest from the panel through the
 * background script to the inspected tab.
 *
 * @typedef {object} RelayMessage
 * @property {import("./constants.js").RELAY_MESSAGE_TYPE} type
 * @property {number} tabId
 * @property {ContentRequest} message
 */

/**
 * Error envelope answered by the background script when relaying fails.
 *
 * @typedef {object} RelayError
 * @property {import("./constants.js").RELAY_ERROR_TYPE} type
 * @property {string} message
 */

/**
 * Payload of the panel-internal custom event that opens the details panel
 * for a Stimulus controller instance.
 *
 * @typedef {object} ShowControllerDetailsDetail
 * @property {string} nodeId - id of the ScanItem whose badge was clicked
 * @property {string} identifier - Stimulus controller identifier
 */

/**
 * Push message sent over the content→background→panel port when a watched
 * controller's values change. Fire-and-forget (no ack).
 *
 * @typedef {object} ValuesChangedPush
 * @property {import("./constants.js").VALUES_CHANGED_PUSH_TYPE} type
 * @property {string} id
 * @property {string} identifier
 * @property {ControllerValue[]} values
 */

/**
 * Push message sent over the content→background→panel port when the inspected
 * page DOM changes in a way that may affect the tree. The panel responds by
 * requesting a fresh scan. Fire-and-forget (no ack).
 *
 * @typedef {object} TreeChangedPush
 * @property {import("./constants.js").TREE_CHANGED_PUSH_TYPE} type
 */

/**
 * Push message sent over the content→background→panel port when a Turbo
 * event fires on `document`. Each push carries the event name, an absolute
 * epoch-ms timestamp captured on the inspected page, the inspector key
 * of the element that dispatched the event so the panel can offer a
 * "reveal in Elements" affordance, and per-event details extracted by
 * `turboEventDetailsFor`.
 *
 * @typedef {object} TurboEventPush
 * @property {import("./constants.js").TURBO_EVENT_PUSH_TYPE} type
 * @property {string} name
 * @property {number} timestamp - `Date.now()` at the moment of capture on the inspected page.
 * @property {string | null} targetId - inspector key for the element that dispatched this Turbo event, resolved on the content script via the same `getElementKey` map used for tree view elements. `null` when the event had no on-page target (e.g. synthetic events dispatched directly on `document`).
 * @property {Record<string, string>} details - extra fields captured on the inspected page at fire time, indexed by the lowercase key the watcher chose (e.g. `url`). Empty when no rule applies.
 */

/**
 * Payload of the panel-internal custom event dispatched after the tree was
 * refreshed with new scan data.
 *
 * @typedef {object} ScanRefreshedDetail
 * @property {ScanItem[]} items
 */
