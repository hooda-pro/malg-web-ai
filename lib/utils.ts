export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9_.\-]/g, "_") || "file";
}
