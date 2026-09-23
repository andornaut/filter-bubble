import { toCanonicalArray } from "./helpers";

// DNS-compliant domain name validation
// Each label: starts/ends with alphanumeric, can contain hyphens, max 63 chars
export const DOMAIN_NAME_REGEX =
  /^[a-z\d]([a-z\d-]{0,61}[a-z\d])?(\.[a-z\d]([a-z\d-]{0,61}[a-z\d])?)*$/i;

// The scheme is optional, so this strips one where there is one and matches
// nothing where there is not.
// Note: This regex is duplicated in src/browser/background.js because that file
// cannot import ES modules (it runs as a service worker without bundling).
export const SCHEME_REGEX = /^(https?)?:\/\//;

// Accept the form's newline/comma-separated string or an already-split array.
const toInput = (value) =>
  Array.isArray(value) ? value.join("\n") : value || "";

// Canonicalize the fields shared by the add/edit form and import so both paths
// store identical data: lowercased, trimmed, de-duplicated, and (for addresses)
// scheme-stripped and validated as bare domain names that `background.js`
// matching relies on.
export const canonicalizeText = (value) =>
  toCanonicalArray(toInput(value).toLowerCase());

// Split on the commas that separate selectors, not on one inside a selector's
// own parentheses, brackets or quotes: `:not(.a, .b)`, `:is()`, `:has()` and
// `[title="a, b"]` each hold commas of their own. A newline always separates,
// so an unbalanced line cannot swallow the lines after it.
const splitSelectors = (input) => {
  const selectors = [];
  let current = "";
  let depth = 0;
  let quote = "";
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === "\\") {
      current += char + (input[i + 1] || "");
      i += 1;
      continue;
    }
    if (char === "\n" || (char === "," && !depth && !quote)) {
      selectors.push(current);
      current = "";
      depth = 0;
      quote = "";
      continue;
    }
    if (quote) {
      quote = char === quote ? "" : quote;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(" || char === "[") {
      depth += 1;
    } else if ((char === ")" || char === "]") && depth) {
      depth -= 1;
    }
    current += char;
  }
  selectors.push(current);
  return selectors;
};

// Parsed by the same browser that will apply it, so a selector it refuses here
// is one the content script would skip with only a console warning.
const isValidSelector = (selector) => {
  try {
    document.createDocumentFragment().querySelector(selector);
    return true;
  } catch {
    return false;
  }
};

export const canonicalizeSelectors = (value) =>
  Array.from(
    new Set(
      splitSelectors(toInput(value))
        .map((selector) => selector.trim())
        .filter(Boolean),
    ),
  )
    .sort()
    .map((selector) => {
      if (!isValidSelector(selector)) {
        throw new Error(`"${selector}" isn't a valid CSS selector`);
      }
      return selector;
    });

export const canonicalizeAddresses = (value) =>
  Array.from(
    new Set(
      toCanonicalArray(toInput(value)).map((address) => {
        // Drop one trailing "/" along with the scheme. Copying a site's
        // address out of the browser gives "https://example.com/", so
        // stripping the scheme but not the slash left the commonest way of
        // getting an address in hand rejected as an invalid domain name. Only
        // a trailing slash, not a path: "example.com/some/article" is a
        // different request, and the field asks for the domain alone.
        const domainName = address
          .toLowerCase()
          .replace(SCHEME_REGEX, "")
          .replace(/\/$/, "");
        if (!domainName.match(DOMAIN_NAME_REGEX)) {
          throw new Error(`"${address}" isn't a valid domain name`);
        }
        return domainName;
      }),
    ),
    // Re-sort: lowercasing/scheme-stripping can change the relative order of
    // the pre-canonicalized input, and the stored array is compared verbatim
    // for duplicate detection, so its order must not depend on the input form.
  ).sort();
