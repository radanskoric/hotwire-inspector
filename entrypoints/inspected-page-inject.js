import { ID_PREFIX, STORE_CONTROLLER_REQUEST_EVENT, STORE_CONTROLLER_RESPONSE_EVENT } from '../lib/constants.js';

export default defineUnlistedScript(() => {
  const script = document.currentScript;

  if (!script) {
    return;
  }

  script.addEventListener(STORE_CONTROLLER_REQUEST_EVENT, (event) => {
    const { selector, identifier, requestId } = event.detail ?? {};
    const response = storeController(selector, identifier);

    script.dispatchEvent(new CustomEvent(STORE_CONTROLLER_RESPONSE_EVENT, {
      detail: { requestId, ...response },
    }));
  });
});

function storeController(selector, identifier) {
  const element = document.querySelector(selector);

  if (!element) {
    return { success: false, error: 'Element not found' };
  }

  const application = window.Stimulus;

  if (!application || typeof application.getControllerForElementAndIdentifier !== 'function') {
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
