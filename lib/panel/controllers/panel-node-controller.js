import { Controller } from '@hotwired/stimulus';

export const PANEL_APP_PROPERTY = '__hotwireInspectorPanelApp';

export class PanelNodeController extends Controller {
  static values = {
    id: String,
  };

  get panelApp() {
    return this.element.ownerDocument[PANEL_APP_PROPERTY];
  }

  highlight() {
    return this.panelApp.highlightNode(this.idValue);
  }

  clearHighlight() {
    return this.panelApp.clearHighlight();
  }

  inspect() {
    return this.panelApp.inspectNode(this.idValue);
  }
}
