/**
 * Sprint 3.1 (review follow-up): after a change to ANOTHER person or
 * organization nothing of the previous context may remain on the page: not in
 * the DOM (hidden is not enough) and not as typed input that could be copied.
 *
 * Renders the real view component of the AuthGuard to HTML and inspects the
 * markup.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { GuardedContent } = await import("../app/(app)/_components/guard-view.tsx");

const SECRET = "GEHEIMER-KUNDE-MUELLER-AG";
const DRAFT_LABEL = "Notiz-zum-Angebot";

function render(options: {
  blocked: boolean;
  refreshed?: { label: string; value: string }[] | null;
}) {
  const page = createElement(
    "main",
    null,
    createElement("h1", null, SECRET),
    createElement("textarea", { defaultValue: "Vertrauliche Eingabe" }),
  );
  return renderToStaticMarkup(
    createElement(
      GuardedContent,
      {
        blocked: options.blocked,
        contentKey: 0,
        contentRef: null,
        refreshed: options.refreshed ?? null,
        onCloseRefreshed: () => undefined,
      } as never,
      page,
    ),
  );
}

describe("page content after a context change", () => {
  it("another person or organization: the old content is not in the DOM at all", () => {
    const html = render({ blocked: true });
    assert.ok(!html.includes(SECRET), "no data of the previous page");
    assert.ok(!html.includes("Vertrauliche Eingabe"), "no typed input");
    assert.ok(!html.includes("<main"), "the content subtree is not rendered");
    assert.ok(!/visibility:\s*hidden/i.test(html), "removed, not merely hidden");
    assert.ok(html.includes('role="alertdialog"'));
  });

  it("another person or organization: no copy function and no drafts are offered", () => {
    const html = render({
      blocked: true,
      // Even if drafts of the old context were still held somewhere:
      refreshed: [{ label: DRAFT_LABEL, value: "Vertrauliche Eingabe" }],
    });
    assert.ok(!/kopier/i.test(html), "no copy button");
    assert.ok(!/Eingaben kopieren|Nicht gespeicherte Eingaben \(/i.test(html), "no offer of drafts");
    assert.ok(!html.includes(DRAFT_LABEL));
    assert.ok(!html.includes("Vertrauliche Eingabe"));
    // The only actions left are reload and sign-in.
    assert.equal((html.match(/<button/g) ?? []).length, 2);
    assert.ok(html.includes("Seite neu laden") && html.includes("Zur Anmeldung"));
  });

  it("same person (new session or role): the content is rendered and drafts may be copied by that person", () => {
    const html = render({
      blocked: false,
      refreshed: [{ label: DRAFT_LABEL, value: "x" }],
    });
    assert.ok(html.includes(SECRET));
    assert.ok(html.includes("Eingaben kopieren"));
    assert.ok(!html.includes(DRAFT_LABEL), "drafts are never displayed");
  });

  it("normal operation: the content is shown without any notice", () => {
    const html = render({ blocked: false });
    assert.ok(html.includes(SECRET));
    assert.ok(!html.includes("alertdialog") && !html.includes('role="status"'));
  });
});
