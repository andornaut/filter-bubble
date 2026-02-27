const formatTime = (dt) => {
  let minutes = dt.getMinutes();
  let hours = dt.getHours();
  const suffix = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  if (minutes < 10) {
    minutes = `0${minutes}`;
  }
  return `${hours}:${minutes}${suffix}`;
};

const isToday = (dt) => {
  const today = new Date();
  return (
    dt.getDate() === today.getDate() &&
    dt.getMonth() === today.getMonth() &&
    dt.getFullYear() === today.getFullYear()
  );
};

export const humanDate = (dateStr) => {
  const dt = new Date(dateStr);
  return isToday(dt) ? formatTime(dt) : dt.toDateString();
};

export const sortByModifiedDateDesc = (arr) =>
  Array.from(arr).sort((a, b) => b.modifiedDate.localeCompare(a.modifiedDate));

// Used to canonicalize identifiers, so it must return a sorted array.
export const toCanonicalArray = (str) =>
  Array.from(
    new Set(
      (str || "")
        .split("\n")
        .map((line) => line.split(","))
        .flat()
        .map((s) => s.trim())
        .filter((s) => s),
    ),
  ).sort();

export const unsplit = (arr) => (arr || []).join(", ");

// Converts an array or comma-separated string to a canonical ID string.
export const arrayToId = (value) =>
  (Array.isArray(value) ? value : toCanonicalArray(value || "")).toString();
