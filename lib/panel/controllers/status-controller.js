import { Controller } from '@hotwired/stimulus';

export class StatusController extends Controller {
  static values = {
    duration: { type: Number, default: 10000 },
  };

  connect() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }

    this.hideTimeout = setTimeout(() => {
      this.element.remove();
    }, this.durationValue);
  }

  disconnect() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }
}
