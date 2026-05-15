import { Controller } from '@hotwired/stimulus';
import { PANEL_BRIDGE_PROPERTY } from '../../constants.js';

export class PanelNodeController extends Controller {
  static values = {
    id: String,
  };

  get panelBridge() {
    return this.element.ownerDocument[PANEL_BRIDGE_PROPERTY];
  }

  highlight() {
    return this.panelBridge.highlightNode(this.idValue);
  }

  clearHighlight() {
    return this.panelBridge.clearHighlight();
  }

  inspect() {
    return this.panelBridge.inspectNode(this.idValue);
  }
}
