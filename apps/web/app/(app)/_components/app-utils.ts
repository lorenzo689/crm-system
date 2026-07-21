export const SIDEBAR_OPEN_WIDTH = "w-72 p-5";
export const SIDEBAR_CLOSED_WIDTH = "w-20 p-4";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
