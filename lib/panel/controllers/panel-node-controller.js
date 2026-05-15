import { Controller } from '@hotwired/stimulus';
import {
  PANEL_BRIDGE_PROPERTY,
  CONTENT_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE,
} from '../../constants.js';

export class PanelNodeController extends Controller {
  static values = {
    id: String,
  };

  get panelBridge() {
    return this.element.ownerDocument[PANEL_BRIDGE_PROPERTY];
  }

  highlight() {
    return this.panelBridge.sendToInspectedTab({
      type: CONTENT_HIGHLIGHT_MESSAGE_TYPE,
      id: this.idValue,
    });
  }

  clearHighlight() {
    return this.panelBridge.sendToInspectedTab({
      type: CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE,
    });
  }

  inspect() {
    return this.panelBridge.inspectNode(this.idValue);
  }
}
