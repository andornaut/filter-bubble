import { toCanonicalArray } from "./helpers";

// DNS-compliant domain name validation
// Each label: starts/ends with alphanumeric, can contain hyphens, max 63 chars
export const DOMAIN_NAME_REGEX =
  /^[a-z\d]([a-z\d-]{0,61}[a-z\d])?(\.[a-z\d]([a-z\d-]{0,61}[a-z\d])?)*$/i;

// Matches http:// or https:// scheme prefix
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

export const canonicalizeSelectors = (value) =>
  toCanonicalArray(toInput(value));

export const canonicalizeAddresses = (value) =>
  Array.from(
    new Set(
      toCanonicalArray(toInput(value)).map((address) => {
        const domainName = address.toLowerCase().replace(SCHEME_REGEX, "");
        if (!domainName.match(DOMAIN_NAME_REGEX)) {
          throw new Error(`"${address}" isn't a valid domain name`);
        }
        return domainName;
      }),
    ),
  );
