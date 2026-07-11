export const uiPackageName = "@bissinger-os/ui";

export type EmptyStateProps = {
  title: string;
  description: string;
};

export function createEmptyState({
  title,
  description,
}: EmptyStateProps): EmptyStateProps {
  return { title, description };
}
