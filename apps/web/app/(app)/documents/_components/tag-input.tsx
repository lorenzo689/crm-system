"use client";

const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;

type TagInputProps = {
  id: string;
  tags: string[];
  pending: string;
  onTagsChange: (tags: string[]) => void;
  onPendingChange: (pending: string) => void;
};

/** Tags incl. a not yet confirmed (Enter) entry, deduplicated and capped. */
export function withPendingTag(tags: string[], pending: string): string[] {
  const tag = pending.trim().slice(0, MAX_TAG_LENGTH);
  return tag && !tags.includes(tag) && tags.length < MAX_TAGS
    ? [...tags, tag]
    : tags;
}

export function TagInput({
  id,
  tags,
  pending,
  onTagsChange,
  onPendingChange,
}: TagInputProps) {
  return (
    <div>
      <input
        id={id}
        type="text"
        value={pending}
        onChange={(event) => onPendingChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onTagsChange(withPendingTag(tags, pending));
            onPendingChange("");
          }
        }}
        maxLength={MAX_TAG_LENGTH}
        placeholder="Tag eingeben und Enter drücken"
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
      />
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded bg-zinc-100 py-0.5 pr-1 pl-2 text-xs text-zinc-600"
            >
              {tag}
              <button
                type="button"
                aria-label={`Tag ${tag} entfernen`}
                onClick={() =>
                  onTagsChange(tags.filter((existing) => existing !== tag))
                }
                className="rounded px-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
