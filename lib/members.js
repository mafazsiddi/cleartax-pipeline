/**
 * "mafas.s@clear.in" -> "Mafas S", "jane_doe@x.com" -> "Jane Doe".
 * Falls back to the address itself if the local part yields nothing.
 */
export function displayNameFromEmail(email) {
  const local = String(email || '').split('@')[0];
  const name = local
    .split(/[._+\-\d]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
    .trim();
  return name || String(email || '').trim();
}
