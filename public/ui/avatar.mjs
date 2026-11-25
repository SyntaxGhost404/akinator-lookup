import {imageURL} from '../image-url.mjs';
import {imageKind} from './catalog.mjs';
import {h, icon} from './dom.mjs';

export const OFFICIAL_DEFAULT = 'https://photos.clarinea.fr/BL_1_fr/none.jpg';
// The unchanged APK silhouette, served by the Worker as image/webp.
export const PICTURELESS_FALLBACK = '/api/placeholder';
export const UNSPECIFIED_IMAGE = '/assets/akinator-placeholder.svg';

// Square coverage at the source resolution. Pictureless entries request the
// official default first and fall back to the APK silhouette; custom images
// keep their full source URL and can be retried.
export function createAvatar(entry, index, onDetails, {large = false} = {}) {
  const kind = imageKind(entry);
  const avatar = h('div', {class: 'avatar sq' + (large ? ' avatar-large' : ''), 'data-image-state': kind});
  const source = kind === 'pictureless'
    ? imageURL(entry.default_avatar_url) || OFFICIAL_DEFAULT
    : kind === 'unspecified' ? UNSPECIFIED_IMAGE : imageURL(entry.avatar_url);
  const image = document.createElement('img');
  image.alt = '';
  image.width = large ? 264 : 144;
  image.height = large ? 264 : 144;
  image.loading = index < 4 || large ? 'eager' : 'lazy';
  image.fetchPriority = index < 4 || large ? 'high' : 'auto';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  const name = entry.name || 'this entry';
  const retry = h('button', {type: 'button', class: 'avatar-retry', hidden: true,
    'aria-label': source ? 'Reload image for ' + name : 'View image details for ' + name},
  icon(source ? 'retry' : 'chevron-right'), h('span', {text: source ? 'Retry' : 'Details'}));
  let usedFallback = false;
  const failed = () => { image.hidden = true; retry.hidden = false; avatar.dataset.loaded = 'failed'; };
  image.onerror = () => {
    if (kind === 'pictureless' && !usedFallback) { usedFallback = true; image.src = PICTURELESS_FALLBACK; }
    else failed();
  };
  image.onload = () => { image.hidden = false; retry.hidden = true; avatar.dataset.loaded = 'true'; };
  retry.onclick = event => {
    event.stopPropagation();
    if (!source) { onDetails?.(); return; }
    usedFallback = false;
    retry.hidden = true;
    image.hidden = false;
    avatar.dataset.loaded = 'false';
    image.src = source;
  };
  avatar.dataset.loaded = 'false';
  avatar.append(image, retry);
  if (source) image.src = source; else failed();
  return avatar;
}
