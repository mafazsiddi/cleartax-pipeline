/* ------------------------------------------------------------------ *
 * Mira — deriving board members from sign-in addresses.
 *
 * The members table is keyed by name, so adding someone on login means
 * turning an email into a display name without ever colliding two people
 * onto one row.
 * ------------------------------------------------------------------ */

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

/**
 * Work out which member row a sign-in belongs to.
 *
 * @param {string} email    the address that just signed in
 * @param {Array<{name: string, email?: string}>} existing  current members
 * @returns {{name: string, isNew: boolean}}
 *
 * Resolution order:
 *   1. Someone already holds this address — reuse that row, whatever it's
 *      named. Prevents a rename in Team from spawning a duplicate on next
 *      login.
 *   2. The derived name exists but has no address on file — claim it. This
 *      is how seeded members ("Mafas S") pick up an email the first time
 *      that person signs in.
 *   3. The derived name is held by a *different* address — suffix it, so two
 *      people who happen to derive the same name stay distinct rows.
 */
export function resolveMemberName(email, existing = []) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return { name: '', isNew: false };

  const byEmail = existing.find(
    (m) => String(m.email || '').trim().toLowerCase() === target
  );
  if (byEmail) return { name: byEmail.name, isNew: false };

  const base = displayNameFromEmail(email);
  const heldByOther = (candidate) =>
    existing.some(
      (m) =>
        String(m.name).trim().toLowerCase() === candidate.toLowerCase() &&
        String(m.email || '').trim() !== ''
    );

  let name = base;
  for (let i = 2; heldByOther(name); i++) name = `${base} ${i}`;

  const claiming = existing.some(
    (m) => String(m.name).trim().toLowerCase() === name.toLowerCase()
  );
  return { name, isNew: !claiming };
}
