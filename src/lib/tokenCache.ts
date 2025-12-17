// Module-level cache for share tokens (persists across component renders)
const tokenCache = new Map<string, string>();
const STORAGE_KEY_PREFIX = 'pronghorn_token_';

export const setProjectToken = (projectId: string, token: string) => {
  // Memory cache (fast synchronous access)
  tokenCache.set(projectId, token);
  
  // sessionStorage (survives refresh within same tab)
  try {
    sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${projectId}`, token);
  } catch (e) {
    console.error('Failed to store token in sessionStorage:', e);
  }
};

export const getProjectToken = (projectId: string): string | null => {
  // Check memory first (fastest)
  const cached = tokenCache.get(projectId);
  if (cached) return cached;
  
  // Fall back to sessionStorage (survives refresh)
  try {
    const stored = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${projectId}`);
    if (stored) {
      // Restore to memory cache
      tokenCache.set(projectId, stored);
      return stored;
    }
  } catch (e) {
    console.error('Failed to read token from sessionStorage:', e);
  }
  
  return null;
};

export const clearProjectToken = (projectId: string) => {
  tokenCache.delete(projectId);
  try {
    sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}${projectId}`);
  } catch (e) {
    // Ignore sessionStorage errors
  }
};
