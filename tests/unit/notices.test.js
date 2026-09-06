// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { showNotice } from "../../lib/panel/notices.js";

function buildNoticeTemplate() {
  document.body.innerHTML =
    '<template id="notice-template"><div class="status-notice" data-controller="status" data-status-tone-value="" role="status" aria-live="polite"><span slot="text"></span></div></template>';
}

describe("showNotice", () => {
  it("clones the notice template and appends one status notice to the body", () => {
    buildNoticeTemplate();

    showNotice(document, "Hello world");

    const notice = document.querySelector(".status-notice");
    expect(notice).not.toBeNull();
    expect(document.body.querySelectorAll(".status-notice")).toHaveLength(1);
    expect(notice.textContent).toBe("Hello world");
    expect(document.body.lastElementChild).toBe(notice);
  });

  it("defaults the tone to positive", () => {
    buildNoticeTemplate();

    showNotice(document, "Stored");

    const notice = document.querySelector(".status-notice");
    expect(notice.dataset.statusToneValue).toBe("positive");
  });

  it("honors an explicit warning tone", () => {
    buildNoticeTemplate();

    showNotice(document, "Element missing", { tone: "warning" });

    const notice = document.querySelector(".status-notice");
    expect(notice.dataset.statusToneValue).toBe("warning");
    expect(notice.textContent).toContain("Element missing");
  });

  it("does nothing when the notice template is unavailable", () => {
    document.body.innerHTML = "";

    expect(() => showNotice(document, "no template")).not.toThrow();
    expect(document.querySelector(".status-notice")).toBeNull();
    expect(document.body.children).toHaveLength(0);
  });

  it("renders a notice when its template has no text slot", () => {
    document.body.innerHTML =
      '<template id="notice-template"><div class="status-notice"></div></template>';

    showNotice(document, "No slot");

    expect(document.querySelector(".status-notice")).not.toBeNull();
  });

  it("renders each call as a separate notice", () => {
    buildNoticeTemplate();

    showNotice(document, "First");
    showNotice(document, "Second", { tone: "warning" });

    const notices = document.querySelectorAll(".status-notice");
    expect(notices).toHaveLength(2);
    expect(notices[0].textContent).toBe("First");
    expect(notices[0].dataset.statusToneValue).toBe("positive");
    expect(notices[1].textContent).toBe("Second");
    expect(notices[1].dataset.statusToneValue).toBe("warning");
  });
});
