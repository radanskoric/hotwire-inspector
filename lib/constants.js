export const PANEL_BRIDGE_PROPERTY = "__hotwireInspectorPanelBridge";

export const ID_PREFIX = "hotwire-inspector";
export const CONTENT_SCAN_MESSAGE_TYPE = `${ID_PREFIX}:scan`;
export const CONTENT_HIGHLIGHT_MESSAGE_TYPE = `${ID_PREFIX}:highlight`;
export const CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE = `${ID_PREFIX}:clear-highlight`;
export const CONTENT_INSPECT_MESSAGE_TYPE = `${ID_PREFIX}:inspect`;
export const CONTENT_STORE_CONTROLLER_MESSAGE_TYPE = `${ID_PREFIX}:store-controller`;
export const CONTENT_CONTROLLER_VALUES_MESSAGE_TYPE = `${ID_PREFIX}:controller-values`;
export const CONTENT_CONTROLLER_TARGETS_MESSAGE_TYPE = `${ID_PREFIX}:controller-targets`;
export const CONTENT_CONTROLLER_OUTLETS_MESSAGE_TYPE = `${ID_PREFIX}:controller-outlets`;
export const RELAY_MESSAGE_TYPE = `${ID_PREFIX}:relay-to-tab`;
export const RELAY_ERROR_TYPE = `${ID_PREFIX}:relay-error`;
export const CONTENT_WATCH_VALUES_MESSAGE_TYPE = `${ID_PREFIX}:watch-values`;
export const CONTENT_UNWATCH_VALUES_MESSAGE_TYPE = `${ID_PREFIX}:unwatch-values`;
export const VALUES_CHANGED_PUSH_TYPE = `${ID_PREFIX}:values-changed`;
export const TREE_CHANGED_PUSH_TYPE = `${ID_PREFIX}:tree-changed`;
export const TURBO_EVENT_PUSH_TYPE = `${ID_PREFIX}:turbo-event`;
export const MAIN_WORLD_TURBO_EVENT_NAME =
  "hotwire-inspector:main-world-turbo-event";
export const PANEL_EVENTS_PORT_NAME_PREFIX = `${ID_PREFIX}:panel-events:`; // + tabId
export const CONTENT_EVENTS_PORT_NAME = `${ID_PREFIX}:content-events`;
export const SHOW_CONTROLLER_DETAILS_EVENT = `${ID_PREFIX}:show-controller-details`;
export const SHOW_EVENT_ATTRIBUTE_EVENT = `${ID_PREFIX}:show-event-attribute`;
export const SCAN_REFRESHED_EVENT = `${ID_PREFIX}:scan-refreshed`;
export const MAIN_WORLD_RPC_REQUEST_EVENT =
  "hotwire-inspector:main-world-rpc-request";
export const MAIN_WORLD_RPC_RESPONSE_EVENT =
  "hotwire-inspector:main-world-rpc-response";
export const MAIN_WORLD_OPERATIONS = [
  "bridgeStatus",
  "storeController",
  "controllerValueDefinitions",
  "controllerOutletDefinitions",
];
