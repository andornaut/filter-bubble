import { toId, toRoot } from "../actions/websites";
import { toCanonicalArray, unsplit } from "../helpers";
import { requestPermissionsFromAddresses } from "../permissions";
import { addFactory, editFactory, listFactory } from "./factories";
import { checkboxField, textField } from "./fields";
import { CSS_SELECTORS_HINT, DOMAIN_NAMES_HINT, HIDE_OR_REMOVE_HINT } from "./hints";

const fields = (website = { addresses: "", hideInsteadOfRemove: false, selectors: "" }) => [
  textField({
    hint: DOMAIN_NAMES_HINT,
    label: "Domain names",
    name: "addresses",
    value: unsplit(website.addresses),
  }),
  textField({
    hint: CSS_SELECTORS_HINT,
    label: "CSS selectors",
    name: "selectors",
    value: unsplit(website.selectors),
  }),
  checkboxField({
    hint: HIDE_OR_REMOVE_HINT,
    label: "Hide instead of remove",
    name: "hideInsteadOfRemove",
    value: website.hideInsteadOfRemove,
  }),
];

const DOMAIN_NAME_REGEX = /^[a-z\d]([a-z\d-]{0,61}[a-z\d])(\.[a-z\d]([a-z\d-]{0,61}[a-z\d])?)*$/i;

const SCHEME_REGEX = /^(https?)?:\/\//;

const transform = (data) => {
  data.addresses = toCanonicalArray(data.addresses);
  data.selectors = toCanonicalArray(data.selectors);

  data.addresses = data.addresses.map((address) => {
    const domainName = address.toLowerCase().replace(SCHEME_REGEX, "");
    if (!domainName.match(DOMAIN_NAME_REGEX)) {
      throw new Error(`"${address}" isn't a valid domain name`);
    }
    return domainName;
  });

  // Removing the URL scheme above can cause there to be new duplicates
  data.addresses = Array.from(new Set(data.addresses));

  // The following can be true if a user submits eg. " " or ","
  if (data.addresses.length === 0) {
    throw new Error('Please fill in the "Domain names" field');
  }
  if (data.selectors.length === 0) {
    throw new Error('Please fill in the "CSS Selectors" field');
  }

  return data;
};

const callback = ({ addresses }) => requestPermissionsFromAddresses(addresses);

const add = addFactory(toRoot, toId, transform, fields, callback);

const edit = editFactory(toRoot, toId, transform, fields, callback);

const details = ({ addresses, selectors }) => (
  <>
    <span className="websites__addresses">{unsplit(addresses)}</span>
    <span className="websites__selectors-label">Selectors:</span>
    <span className="websites__selectors">{unsplit(selectors)}</span>
  </>
);

const list = listFactory(toRoot, toId, details);

export const Websites = ({ state }) => (
  <section>
    <div className="form">{state.websites.selected ? edit(state.websites.selected) : add()}</div>
    {list(state)}
  </section>
);
