export const sortByModifiedDateDesc = (arr) => {
  arr = Array.from(arr);
  arr.sort((a, b) => new Date(a.modifiedDate) - new Date(b.modifiedDate)).reverse();
  return arr;
};

// Used to canonicalize identifiers, so it must return a sorted array.
export const toCanonicalArray = (str) =>
  Array.from(
    new Set(
      (str || '')
        .split('\n')
        .map((line) => line.split(','))
        .flat()
        .map((s) => s.trim())
        .filter((s) => s),
    ),
  ).sort();

export const unsplit = (arr) => (arr || []).join(', ');
