import { Controller } from '@hotwired/stimulus';

export class NodeController extends Controller {
  static targets = ['children'];

  toggleChildren() {
    this.element.classList.toggle('expanded');
  }
}
