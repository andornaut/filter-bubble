const formatTime = (dt) => {
  let minutes = dt.getMinutes();
  let hours = dt.getHours();
  let suffix = 'am';
  if (hours > 12) {
    hours -= 12;
    suffix = 'pm';
  }
  if (hours === 0) {
    hours = '00';
  }
  if (minutes < 10) {
    minutes = `0${minutes}`;
  }
  return `${hours}:${minutes}${suffix}`;
};

const isToday = (dt) => {
  const today = new Date();
  return (
    dt.getDate() === today.getDate() && dt.getMonth() === today.getMonth() && dt.getFullYear() === today.getFullYear()
  );
};

export const humanDate = (dateStr) => {
  const dt = new Date(dateStr);
  return isToday(dt) ? formatTime(dt) : dt.toDateString();
};

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
