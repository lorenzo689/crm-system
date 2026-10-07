import { Suspense } from "react";
import { DocumentsContent } from "./_components/documents-content";

export default function DocumentsPage() {
  return (
    <Suspense>
      <DocumentsContent />
    </Suspense>
  );
}
