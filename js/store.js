// Collection persistence.
//
// Layer 1 — localStorage, written on every toggle. This is what makes a returning
// visitor's dex appear instantly: no account, no request, no spinner. Loss modes are
// the user clearing site data or private browsing; both are surfaced in the UI copy.
//
// Layer 2 — a share code, for moving the collection between devices without a
// backend. "SDX1." + base64url of a bitmask over the slot list in slots.json order.
// That ordering is therefore load-bearing: build_web_data.py appends, never reorders.
//
// A storage backend with accounts can slot in behind the same interface later; the
// non-commercial constraint (Epic Fan Content Policy, D-18) makes "no server to pay
// for" a feature for now.

const KEY = "spritedex.owned.v1";
const CODE_PREFIX = "SDX1.";

export function loadOwned(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set(); // corrupt or unavailable storage must not brick the app
  }
}

export function saveOwned(owned, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify([...owned]));
    return true;
  } catch {
    return false; // e.g. private browsing quota — caller shows the warning banner
  }
}

export function toggle(owned, id, storage = globalThis.localStorage) {
  const next = new Set(owned);
  next.has(id) ? next.delete(id) : next.add(id);
  const persisted = saveOwned(next, storage);
  return { owned: next, persisted };
}

export function clearAll(storage = globalThis.localStorage) {
  try { storage.removeItem(KEY); } catch { /* nothing to do */ }
  return new Set();
}

// --- Share codes -----------------------------------------------------------

function toBase64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = (globalThis.btoa ?? ((s) => Buffer.from(s, "binary").toString("base64")))(bin);
  return b64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const b64 = text.replaceAll("-", "+").replaceAll("_", "/");
  const bin = (globalThis.atob ?? ((s) => Buffer.from(s, "base64").toString("binary")))(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/// ~26 characters for 109 slots. Encodes positions, not ids, hence the ordering rule.
export function exportCode(owned, slots) {
  const bytes = new Uint8Array(Math.ceil(slots.length / 8));
  slots.forEach((slot, i) => {
    if (owned.has(slot.id)) bytes[i >> 3] |= 1 << (i & 7);
  });
  return CODE_PREFIX + toBase64Url(bytes);
}

/// Returns a Set, or null for anything that is not a valid code. Unknown trailing
/// bits (a code from a newer, longer catalogue) are ignored rather than fatal.
export function importCode(code, slots) {
  const trimmed = code.trim();
  if (!trimmed.startsWith(CODE_PREFIX)) return null;
  let bytes;
  try {
    bytes = fromBase64Url(trimmed.slice(CODE_PREFIX.length));
  } catch {
    return null;
  }
  if (bytes.length === 0) return null;
  const owned = new Set();
  slots.forEach((slot, i) => {
    if (i >> 3 < bytes.length && (bytes[i >> 3] & (1 << (i & 7)))) owned.add(slot.id);
  });
  return owned;
}
