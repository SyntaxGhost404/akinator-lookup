// Akinator subject IDs, in the order the app presents them.
export const CATEGORIES = {
  '1': {label: 'Characters', icon: 'person'},
  '2': {label: 'Objects', icon: 'cube'},
  '13': {label: 'Movies and TV', icon: 'film'},
  '14': {label: 'Animals', icon: 'paw'},
};
const order = Object.keys(CATEGORIES);

export const categoryName = instance => CATEGORIES[instance.subject_id]?.label || instance.label || 'Category';
export const categoryIcon = instance => CATEGORIES[instance.subject_id]?.icon || 'tag';

export function sortInstances(instances) {
  const rank = instance => {
    const index = order.indexOf(String(instance.subject_id));
    return index < 0 ? order.length : index;
  };
  return [...instances].sort((a, b) => rank(a) - rank(b) || categoryName(a).localeCompare(categoryName(b)));
}

// Image filters. Values are unchanged from the original lookup.
export const FILTER_OPTIONS = [
  {value: 'all', label: 'All'},
  {value: 'pictureless', label: 'Pictureless'},
  {value: 'supplied', label: 'Custom'},
  {value: 'unknown', label: 'Unspecified'},
];

export function imageKind(entry) {
  if (['missing', 'placeholder'].includes(entry.avatar_status)) return 'pictureless';
  return entry.avatar_status === 'supplied' ? 'custom' : 'unspecified';
}

export function matchesFilter(entry, filter) {
  if (filter === 'all') return true;
  if (filter === 'pictureless') return ['missing', 'placeholder'].includes(entry.avatar_status);
  return entry.avatar_status === filter;
}

export const IMAGE_LABELS = {
  pictureless: {badge: 'Pictureless', detail: 'No custom image. Akinator shows its default picture.', icon: 'image-off'},
  custom: {badge: 'Custom image', detail: 'Shows the image uploaded for this entry.', icon: 'image'},
  unspecified: {badge: 'Unspecified', detail: 'Akinator returned no image information.', icon: 'image-unknown'},
};
