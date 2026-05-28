import { ID_PREFIX, STORE_CONTROLLER_REQUEST_EVENT, STORE_CONTROLLER_RESPONSE_EVENT } from '../lib/constants.js';

export default defineUnlistedScript(() => {
  const script = document.currentScript;

  if (!script) {
    return;
  }

  script.addEventListener(STORE_CONTROLLER_REQUEST_EVENT, (event) => {
    const detail = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
    const { selector, identifier, requestId } = detail ?? {};
    const response = storeController(selector, identifier);

    script.dispatchEvent(new CustomEvent(STORE_CONTROLLER_RESPONSE_EVENT, {
      detail: JSON.stringify({ requestId, ...response }),
    }));
  });
});

function checkApplicationCandidate(candidate) {
  return candidate && typeof candidate.getControllerForElementAndIdentifier === 'function';
}

function detectApplication() {
  if (checkApplicationCandidate(window.Stimulus)) { return window.Stimulus; }
  if (checkApplicationCandidate(window.stimulusApp)) { return window.stimulusApp; }
  if (checkApplicationCandidate(window.StimulusApp)) { return window.StimulusApp; }
  return null;
}

function storeController(selector, identifier) {
  const element = document.querySelector(selector);

  if (!element) {
    return { success: false, error: 'Element not found' };
  }

  const application = detectApplication();
  if (!application) {
    return { success: false, error: 'Stimulus application not found' };
  }

  const controller = application.getControllerForElementAndIdentifier(element, identifier);

  if (!controller) {
    return { success: false, error: 'Controller not found' };
  }

  for (let index = 1; ; index += 1) {
    const name = `temp${index}`;

    if (!(name in window)) {
      window[name] = controller;
      console.info('Hotwire Inspector: ' + identifier + ' controller stored as ' + name, controller);
      return { success: true, name, identifier };
    }
  }
}
