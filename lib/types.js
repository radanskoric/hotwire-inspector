/**
 * Shared JSDoc type definitions for the Hotwire Inspector messaging
 * boundaries: panel ↔ background script ↔ content script ↔ inspected page.
 *
 * This module has no runtime exports. Reference a type from another file with
 * `import("./types.js").TypeName` (adjust the relative path as needed).
 */

export {};

/**
 * A Stimulus target found inside an inspected element.
 *
 * @typedef {object} ScanTarget
 * @property {string} controller - identifier of the controller defining the target
 * @property {string} name - target name
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
 * Any request the panel can send to the content script.
 *
 * @typedef {ScanRequest | HighlightRequest | ClearHighlightRequest | InspectRequest | StoreControllerRequest} ContentRequest
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
 * Payload of the custom event sent from the content script to the injected
 * page script to request storing a controller.
 *
 * @typedef {object} StoreControllerRequestDetail
 * @property {string} selector
 * @property {string} identifier
 * @property {string} requestId
 */

/**
 * Payload of the custom event answered by the injected page script.
 *
 * @typedef {StoreControllerResponse & { requestId: string }} StoreControllerResponseDetail
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
 * Payload of the panel-internal custom event dispatched after the tree was
 * refreshed with new scan data.
 *
 * @typedef {object} ScanRefreshedDetail
 * @property {ScanItem[]} items
 */
