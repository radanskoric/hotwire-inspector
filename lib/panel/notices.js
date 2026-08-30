/**
 * Tone for status notices. `positive` is the default (green) and `warning`
 * highlights that an action could not complete as expected.
 *
 * @typedef {"positive" | "warning"} NoticeTone
 */

/**
 * Clones the shared `#notice-template` and appends a single status notice
 * to the panel document body. The template statically contains a root
 * `<div class="status-notice" data-controller="status">` element so the
 * `StatusController` re-attaches and auto-removes the notice after its
 * configured duration.
 *
 * @param {Document} document
 * @param {string} message
 * @param {{ tone?: NoticeTone }} [options]
 */
export function showNotice(document, message, { tone = "positive" } = {}) {
  const template = /** @type {HTMLTemplateElement | null} */ (
    document.getElementById("notice-template")
  );
  if (!template) return;
  const node = /** @type {HTMLElement} */ (
    /** @type {DocumentFragment} */ (template.content.cloneNode(true))
      .firstElementChild
  );
  node.dataset.statusToneValue = tone;
  const textSlot = node.querySelector('[slot="text"]');
  if (textSlot) textSlot.textContent = message;
  document.body.appendChild(node);
}
