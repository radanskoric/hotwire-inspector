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
}
