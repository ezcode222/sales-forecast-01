export function getRequestWorkbookBuffer(body: unknown) {
  if (Buffer.isBuffer(body)) return body;
  if (body && typeof body === 'object' && 'fileBase64' in body) {
    const encoded = (body as { fileBase64?: unknown }).fileBase64;
    if (typeof encoded === 'string' && encoded.trim()) return Buffer.from(encoded, 'base64');
  }
  return null;
}
