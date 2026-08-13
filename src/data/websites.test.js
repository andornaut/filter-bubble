import defaultWebsites from "./websites.json";

// The selectors Filter Bubble ships for the sites it supports out of the box.
// Each case runs them against markup shaped like the page they were written
// for, so a correction to one changes what this asserts, which is the point.
const selectorsFor = (id) => {
  const website = defaultWebsites.list.find((item) => item.id === id);
  if (!website) {
    throw new Error(`No default website with id "${id}"`);
  }
  return website.selectors;
};

// The elements the content script would consider, which is the union of the
// website's selectors applied to this document.
//
// Collected as elements and labelled afterwards, not keyed on `id`: keying on
// it folds every id-less match into one entry, so a fixture that forgets an id
// would report fewer over-matches than it found.
const targeted = (id, { bodyClass = "", html }) => {
  document.body.className = bodyClass;
  document.body.innerHTML = html;
  const matched = new Set();
  selectorsFor(id).forEach((selector) => {
    document
      .querySelectorAll(selector)
      .forEach((element) => matched.add(element));
  });
  return Array.from(matched)
    .map((element) => element.id || `<${element.tagName.toLowerCase()}>`)
    .sort();
};

describe("the shipped default selectors", () => {
  // A new default with no case here would otherwise go untested silently.
  it("cover every website in the shipped data file", () => {
    expect(defaultWebsites.list.map((website) => website.id).sort()).toEqual([
      "default-arstechnica",
      "default-hackernews",
      "default-reddit",
      "default-tildes",
    ]);
  });

  it("target Tildes topic listing items", () => {
    expect(
      targeted("default-tildes", {
        html: `
          <main>
            <ol class="topic-listing">
              <li id="t1"><article class="topic"><h1>A story</h1></article></li>
              <li id="t2"><article class="topic"><h1>Another</h1></article></li>
            </ol>
            <div id="sidebar">A sidebar</div>
          </main>`,
      }),
    ).toEqual(["t1", "t2"]);
  });

  it("target Reddit posts in both layouts", () => {
    // "article" covers the current site, ".listing-page .thing" old.reddit.
    expect(
      targeted("default-reddit", {
        html: `
          <div id="header">A banner</div>
          <main class="listing-page">
            <article id="r1"><h3>A story</h3></article>
            <article id="r2"><h3>Another</h3></article>
            <div class="thing" id="r3">An old-reddit row</div>
          </main>`,
      }),
    ).toEqual(["r1", "r2", "r3"]);
  });

  it("target Hacker News submission rows", () => {
    // The row carrying a submission's score and comment count is a sibling of
    // the submission row, not a child, so it is left behind either way.
    expect(
      targeted("default-hackernews", {
        html: `
          <table id="hnmain"><tbody>
            <tr class="athing submission" id="s1"><td>A story</td></tr>
            <tr id="s1-sub"><td class="subtext">120 points</td></tr>
            <tr class="athing submission" id="s2"><td>Another</td></tr>
          </tbody></table>`,
      }),
    ).toEqual(["s1", "s2"]);
  });

  it("leave the story you opened alone on a Hacker News item page", () => {
    // `:not(.fatitem *)` is what keeps the story you deliberately clicked
    // through to from being hidden out from under you.
    expect(
      targeted("default-hackernews", {
        html: `
          <table id="hnmain"><tbody>
            <tr><td><table class="fatitem"><tbody>
              <tr class="athing submission" id="the-story"><td>A story</td></tr>
            </tbody></table></td></tr>
            <tr><td class="comment" id="a-comment">A comment</td></tr>
          </tbody></table>`,
      }),
    ).toEqual([]);
  });

  it("target Ars Technica home page items only", () => {
    // Both selectors are scoped to `main`, so site furniture stays put.
    expect(
      targeted("default-arstechnica", {
        bodyClass: "home",
        html: `
          <nav id="site-nav">A menu</nav>
          <main>
            <ul>
              <li class="group" id="g1">A story</li>
              <li class="group" id="g2">Another</li>
            </ul>
            <article id="a1">A third</article>
          </main>`,
      }),
    ).toEqual(["a1", "g1", "g2"]);
  });

  it("apply nothing on an Ars Technica page that is not the home page", () => {
    // Both selectors are scoped to `body.home`. An article page is not a feed,
    // so the story you opened stays put, and so does everything around it,
    // which is why the scoping is there rather than a bare "main article".
    expect(
      targeted("default-arstechnica", {
        html: `
          <main>
            <article id="the-article">A story, opened deliberately</article>
            <ul><li class="group" id="related">A related story</li></ul>
          </main>`,
      }),
    ).toEqual([]);
  });
});
