export const IMPORT_ACTIVITY_KEY = 'finpal.lastImportAt.v1';
export const IMPORT_ACTIVITY_EVENT = 'finpal:import-completed';

export function recordImportActivity(): void {
  const timestamp = new Date().toISOString();
  localStorage.setItem(IMPORT_ACTIVITY_KEY, timestamp);
  window.dispatchEvent(new Event(IMPORT_ACTIVITY_EVENT));
}

export function wasImportedToday(timestamp: string | null | undefined, now = new Date()): boolean {
  if (!timestamp) return false;
  const importedAt = new Date(timestamp);
  return importedAt <= now && importedAt.toDateString() === now.toDateString();
}
