import { Controller } from '@hotwired/stimulus';

export class NodeController extends Controller {
  static targets = ['children'];

  toggleChildren() {
    if (!this.hasChildrenTarget) return;
    this.childrenTarget.hidden = !this.childrenTarget.hidden;
  }
}
