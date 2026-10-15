import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getDefaultVencimento(competenciaStr?: string | null): string {
  if (!competenciaStr) {
    const now = new Date();
    const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const y = nextDate.getFullYear();
    const m = String(nextDate.getMonth() + 1).padStart(2, "0");
    const d = String(nextDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const clean = competenciaStr.split("T")[0];
  const parts = clean.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (isNaN(year) || isNaN(month)) {
    const d = new Date(competenciaStr);
    const nextDate = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const y = nextDate.getFullYear();
    const m = String(nextDate.getMonth() + 1).padStart(2, "0");
    const day = String(nextDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  // month is 1-based (e.g. 9 for Sept). In Date(year, month, 1), month index 9 is October.
  const nextDate = new Date(year, month, 1);
  const y = nextDate.getFullYear();
  const m = String(nextDate.getMonth() + 1).padStart(2, "0");
  const day = String(nextDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

