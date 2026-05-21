import { Controller } from '@hotwired/stimulus';
import { PANEL_BRIDGE_PROPERTY } from '../../constants.js';

export class PanelController extends Controller {
  get bridge() {
    return this.element.ownerDocument[PANEL_BRIDGE_PROPERTY];
  }

  sendToInspectedTab(message) {
    return this.bridge.sendToInspectedTab(message);
  }

  inspectNode(id) {
    return this.bridge.inspectNode(id);
  }

  storeControllerNode(id, identifier) {
    return this.bridge.storeControllerNode(id, identifier);
  }
}
