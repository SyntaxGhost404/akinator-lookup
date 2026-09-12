// One allowlist for normalized server results and the image renderer. URLs are
// preserved at their original resolution; this is never an image proxy.
export function imageURL(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password &&
        ['akinator.com', 'elokence.com', 'clarinea.fr'].some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain))) return url.href;
  } catch {}
  return null;
}
