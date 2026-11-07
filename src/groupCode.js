// The group code keeps casual visitors out. It's checked on the phone, so it isn't real
// security. Only its SHA-256 hash is stored here, because this repo is public.
export const GROUP_CODE_HASH = 'e62a154f3876bbcf74149f283d112d09275cb45075edaa9b3d705da78b42ca5c';

const UNLOCK_KEY = 'jf:group_unlocked';

function normalizeCode(code) {
  return (code ?? '').replace(/[\s-]/g, '').toUpperCase();
}

async function hashCode(code) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeCode(code)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Returns true if this device has already entered the current group code. */
export function isUnlocked() {
  try {
    return localStorage.getItem(UNLOCK_KEY) === GROUP_CODE_HASH;
  } catch {
    return false;
  }
}

/** Checks a code and remembers it on this device if it's right. Returns true if it matched. */
export async function tryGroupCode(code) {
  if ((await hashCode(code)) !== GROUP_CODE_HASH) return false;
  try {
    localStorage.setItem(UNLOCK_KEY, GROUP_CODE_HASH);
  } catch { /* ignore */ }
  return true;
}
