export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB

export function blobEnabled() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * Streams a private blob's content back through our own server — Vercel
 * Blob's private URLs aren't directly browser-fetchable, so `get()` is how
 * a private file actually gets delivered, not a signed URL.
 */
export async function getBlobStream(url) {
  const { get } = await import('@vercel/blob');
  return get(url, { access: 'private' });
}

export async function deleteBlob(url) {
  const { del } = await import('@vercel/blob');
  await del(url);
}
