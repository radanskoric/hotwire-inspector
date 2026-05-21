import { PanelController } from './panel-controller.js';
import {
  CONTENT_HIGHLIGHT_MESSAGE_TYPE,
  CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE,
} from '../../constants.js';

export class PanelNodeController extends PanelController {
  static values = {
    id: String,
  };

  highlight() {
    return this.sendToInspectedTab({
      type: CONTENT_HIGHLIGHT_MESSAGE_TYPE,
      id: this.idValue,
    });
  }

  clearHighlight() {
    return this.sendToInspectedTab({
      type: CONTENT_CLEAR_HIGHLIGHT_MESSAGE_TYPE,
    });
  }

  inspect() {
    return this.inspectNode(this.idValue);
  }

  async storeController(event) {
    event.stopPropagation();

    const result = await this.storeControllerNode(this.idValue, event.currentTarget.dataset.controllerIdentifier);
    const template = this.element.ownerDocument.getElementById('notice-template');

    if (template) {
      const noticeElement = template.content.cloneNode(true).firstElementChild;
      const textTarget = noticeElement.querySelector('[slot="text"]');
      textTarget.textContent = result.success
        ? `${result.identifier} controller instance stored as ${result.name}`
        : result.error || 'Controller storage failed';
      this.element.ownerDocument.body.appendChild(noticeElement);
    }

    return result;
  }
}
