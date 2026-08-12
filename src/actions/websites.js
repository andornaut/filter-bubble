import { unsplit } from "../helpers";
import { createCollectionActions } from "./factories";

// Two websites that list the same domain name cannot both govern it: a page is
// matched against one website and filtered with that website's selectors alone,
// never with the union of every website that covers the address. The entry that
// loses does nothing, and nothing says so - it sits in the list looking
// configured. Refuse the collision where it is made instead.
//
// Stricter than the content-key rule it replaces, which only caught two
// websites whose entire address list was identical, and so let
// ["example.com"] and ["example.com", "news.example.com"] coexist.
//
// `enabled` is deliberately not consulted, which matches the rule this
// replaces: a disabled website is still a configuration, and enabling it later
// must not be able to resurrect a collision. To move a domain to a new entry,
// take it off the old one - editing is checked against the incoming addresses,
// so that is always possible.
export const findAddressConflict = (list, data, exceptId) => {
  const addresses = new Set(data.addresses || []);
  const conflicting = list.find(
    (website) =>
      website.id !== exceptId &&
      (website.addresses || []).some((address) => addresses.has(address)),
  );
  if (!conflicting) {
    return "";
  }
  const shared = conflicting.addresses.filter((address) =>
    addresses.has(address),
  );
  return `Already covered by another website: ${unsplit(shared)}`;
};

export const websiteActions = createCollectionActions(
  "websites",
  "addresses",
  findAddressConflict,
);
export const { toContentKey, toId } = websiteActions;
