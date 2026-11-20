/**
 * Unsaved input the user typed into the page. When the session changes the page
 * is blocked; this keeps what was typed so it can be copied before the user
 * reloads. It only reads text the user entered themselves (changed text
 * fields); passwords, hidden fields and untouched fields are never included,
 * and nothing is stored anywhere: the result lives in component state only.
 */
export type Draft = { label: string; value: string };

const SKIPPED_INPUT_TYPES = new Set([
  "password",
  "hidden",
  "file",
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "image",
  "range",
  "color",
]);

function labelOf(field: HTMLInputElement | HTMLTextAreaElement) {
  const explicit = field.getAttribute("aria-label");
  if (explicit) return explicit;
  const label = field.labels?.[0]?.textContent?.trim();
  return label || field.name || field.placeholder || "Eingabefeld";
}

export function captureDrafts(root: ParentNode): Draft[] {
  const drafts: Draft[] = [];
  const fields = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    "input, textarea",
  );
  for (const field of fields) {
    if (field instanceof HTMLInputElement && SKIPPED_INPUT_TYPES.has(field.type)) {
      continue;
    }
    if (field.autocomplete?.includes("password")) continue;
    const value = field.value;
    if (value.trim() === "" || value === field.defaultValue) continue;
    drafts.push({ label: labelOf(field), value });
  }
  return drafts;
}
