// DNS-compliant domain name validation
// Each label: starts/ends with alphanumeric, can contain hyphens, max 63 chars
export const DOMAIN_NAME_REGEX =
  /^[a-z\d]([a-z\d-]{0,61}[a-z\d])(\.[a-z\d]([a-z\d-]{0,61}[a-z\d])?)*$/i;

// Matches http:// or https:// scheme prefix
// Note: This regex is duplicated in static/js/background.js because that file
// cannot import ES modules (it runs as a service worker without bundling).
export const SCHEME_REGEX = /^(https?)?:\/\//;
