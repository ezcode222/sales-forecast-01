export type AppMode = 'nyl' | 'ufa';
export type PublicAppMode = 'nylon' | 'ufa';

const MODE_STORAGE_KEY = 'sales-forecast:app-mode:v1';

export function parsePublicAppMode(value: unknown): AppMode {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'ufa' ? 'ufa' : 'nyl';
}

export function toPublicAppMode(mode: AppMode): PublicAppMode {
  return mode === 'ufa' ? 'ufa' : 'nylon';
}

export function readStoredAppMode(): AppMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (!raw) return null;
    return parsePublicAppMode(raw);
  } catch {
    return null;
  }
}

export function storeAppMode(mode: AppMode) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, toPublicAppMode(mode));
  } catch {
    // optional
  }
}

/** Resolve mode from URL (?mode=nylon|ufa), then localStorage, defaulting to nylon. */
export function resolveClientAppMode(search = typeof window !== 'undefined' ? window.location.search : ''): AppMode {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  if (params.has('mode')) {
    return parsePublicAppMode(params.get('mode'));
  }
  return readStoredAppMode() ?? 'nyl';
}

/**
 * Ensure the browser URL has a canonical ?mode=nylon|ufa without a navigation reload.
 * Returns the resolved internal mode.
 */
export function ensureCanonicalModeInUrl(): AppMode {
  if (typeof window === 'undefined') return 'nyl';
  const mode = resolveClientAppMode(window.location.search);
  const publicMode = toPublicAppMode(mode);
  const url = new URL(window.location.href);
  url.searchParams.set('mode', publicMode);
  const canonicalPathname = url.pathname.length > 1
    ? url.pathname.replace(/\/+$/, '')
    : url.pathname;
  const canonicalUrl = `${canonicalPathname}${url.search}${url.hash}`;
  const currentUrl = `${url.pathname}${window.location.search}${url.hash}`;
  if (currentUrl !== canonicalUrl) {
    window.history.replaceState(window.history.state, '', canonicalUrl);
  }
  storeAppMode(mode);
  return mode;
}

/** Full-page navigation to switch modes (clears in-memory React state safely). */
export function navigateToAppMode(mode: AppMode) {
  if (typeof window === 'undefined') return;
  const publicMode = toPublicAppMode(mode);
  storeAppMode(mode);
  const url = new URL(window.location.href);
  url.searchParams.set('mode', publicMode);
  window.location.assign(`${url.pathname}${url.search}${url.hash}`);
}

let activeClientAppMode: AppMode = typeof window !== 'undefined'
  ? resolveClientAppMode(window.location.search)
  : 'nyl';

export function getActiveClientAppMode(): AppMode {
  return activeClientAppMode;
}

export function setActiveClientAppMode(mode: AppMode) {
  activeClientAppMode = mode;
  storeAppMode(mode);
}
