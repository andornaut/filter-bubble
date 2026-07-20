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

// Normalize to ISO 8601, the only format the app stores or compares. Dates are
// ordered lexicographically, so a parseable-but-non-ISO value ("March 5, 2020")
// would sort as text and land in the wrong place. Returns "" if unparseable.
export const toIsoDate = (value) =>
  typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? new Date(value).toJSON()
    : "";

// Display clock, set on create/edit and left alone by changes that must not
// reorder the list (toggling `enabled`, importing). Falls back to the
// `modifiedDate` sync clock for items stored before this field existed, for the
// seeded defaults, and for errors. Coerced because `localeCompare` needs a
// string; normalization happens where untrusted dates enter.
export const toSortDate = (item) =>
  String(item.sortDate || item.modifiedDate || "");

// Decorate-sort-undecorate so each sort key is derived once per item rather
// than twice per comparison.
export const sortByDateDesc = (arr) =>
  Array.from(arr)
    .map((item) => [toSortDate(item), item])
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, item]) => item);

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

// Stable per-item id derived from a JSON date (epoch milliseconds), made
// unique against `existingIds` by bumping until free. Deterministic so two
// devices deriving an id from the same date produce the same value.
export const toItemId = (existingIds, jsonDate) => {
  let n = Date.parse(jsonDate) || 0;
  let id = String(n);
  while (existingIds.has(id)) {
    n += 1;
    id = String(n);
  }
  return id;
};
