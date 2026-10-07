import Link from "next/link";
import type { DocumentListItem } from "@/lib/documents";

const linkClassName =
  "text-zinc-900 underline-offset-2 hover:text-amber-700 hover:underline";

type DocumentAssignmentProps = {
  document: DocumentListItem;
  customerNameByProject: Map<string, string>;
};

export function DocumentAssignment({
  document,
  customerNameByProject,
}: DocumentAssignmentProps) {
  if (document.project) {
    const customerName =
      document.customer?.name ?? customerNameByProject.get(document.project.id);

    return (
      <div className="min-w-0">
        <Link
          href={`/projects/${document.project.id}`}
          onClick={(event) => event.stopPropagation()}
          className={`block truncate ${linkClassName}`}
        >
          {document.project.name}
        </Link>
        {customerName && (
          <p className="truncate text-xs text-zinc-400">{customerName}</p>
        )}
      </div>
    );
  }

  if (document.customer) {
    return (
      <Link
        href={`/customers?open=${document.customer.id}`}
        onClick={(event) => event.stopPropagation()}
        className={`block truncate ${linkClassName}`}
      >
        {document.customer.name}
      </Link>
    );
  }

  return (
    <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
      Global
    </span>
  );
}
