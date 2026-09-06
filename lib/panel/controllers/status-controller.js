import { Controller } from "@hotwired/stimulus";

export class StatusController extends Controller {
  /** @override */
  static values = {
    duration: { type: Number, default: 10000 },
  };

  /**
   * @override
   * @this {StatusController & { durationValue: number }}
   */
  connect() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }

    this.hideTimeout = setTimeout(() => {
      this.element.remove();
    }, this.durationValue);
  }

  /** @override */
  disconnect() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }
}
