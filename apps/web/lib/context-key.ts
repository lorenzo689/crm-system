/**
 * Decides when the page content must be rebuilt after the session context
 * changed (new session or role of the SAME person). Rebuilding discards every
 * component's own state (loaded data, previews, open dialogs), so nothing
 * loaded under the old context stays visible. A blocked page (other person or
 * organization) is never rebuilt: its content stays hidden and untouched so the
 * user can still copy what they typed.
 */
export type ContentKey = { epoch: number; key: number };

export function advanceContentKey(
  previous: ContentKey,
  epoch: number,
  blocked: boolean,
): ContentKey {
  if (blocked || previous.epoch === epoch) return previous;
  return { epoch, key: previous.key + 1 };
}
