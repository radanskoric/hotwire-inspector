import { PanelController } from "./panel-controller.js";
import { showNotice } from "../notices.js";

const TARGET_MISSING_MESSAGE =
  "Element no longer exists so it can't be revealed.";

export class EventBoxController extends PanelController {
  /** @override */
  static values = { targetId: String };

  /**
   * Mirrors `PanelNodeController.inspect`: asks the panel bridge to reveal
   * the element that originally dispatched this Turbo event. When the
   * element is gone (deleted from the DOM after the event fired) the
   * bridge reply has `success: false; selector: null` and we surface a
   * warning notice so the click isn't silently swallowed.
   *
   * @this {EventBoxController & { targetIdValue: string }}
   */
  async inspect() {
    const response = await this.inspectNode(this.targetIdValue);
    if (!response?.success) {
      this.showTargetMissing();
    }
  }

  /**
   * Renders the warning notice via the shared helper. Kept as a method
   * (instead of inline in `inspect`) so the call site stays readable and
   * the message lives next to the action it documents.
   */
  showTargetMissing() {
    showNotice(this.element.ownerDocument, TARGET_MISSING_MESSAGE, {
      tone: "warning",
    });
  }
}
