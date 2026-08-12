// The configuration most tests need: hide anything about "politics" inside an
// `<article>` on the fixture site. It matches how `site/feed.html` is built, so
// changing that page and changing this stay one job rather than two.
//
// Spread these to vary one field - `{ ...LOCALHOST_WEBSITE, selectors: [".thing"] }`
// - and write the whole thing out in the spec when what is being seeded is
// itself the subject of the test.
export const POLITICS_TOPIC = { id: "topic-politics", text: ["politics"] };

export const LOCALHOST_WEBSITE = {
  addresses: ["localhost"],
  id: "site-localhost",
  selectors: ["article"],
};

export const SEED = {
  topics: [POLITICS_TOPIC],
  websites: [LOCALHOST_WEBSITE],
};
