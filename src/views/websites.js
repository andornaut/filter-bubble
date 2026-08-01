import { getState } from "statezero/src";

import { websiteActions } from "../actions/websites";
import { unsplit } from "../helpers";
import {
  checkAllPermissions,
  requestPermissionsFromAddresses,
} from "../permissions";
import { canonicalizeAddresses, canonicalizeSelectors } from "../validation";
import { Collection } from "./collection";
import { checkboxField, textField } from "./fields";
import {
  CSS_SELECTORS_HINT,
  DOMAIN_NAMES_HINT,
  HIDE_OR_REMOVE_HINT,
} from "./hints";

const fields = (
  website = { addresses: "", hideInsteadOfRemove: false, selectors: "" },
) => [
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

const transform = (data) => {
  data.addresses = canonicalizeAddresses(data.addresses);
  data.selectors = canonicalizeSelectors(data.selectors);

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

// The permission flags count only enabled websites, so toggling or deleting
// one can change them (e.g. enabling a website whose host permission was never
// granted must surface the banner and warning). Add/edit recompute via
// `callback` -> requestPermissionsFromAddresses.
const actions = {
  ...websiteActions,
  deleteItem: (id) => {
    // Host permissions granted for a website are deliberately not released when
    // it is deleted. Revoking would cost more than it saves: the extension
    // repairs already-filtered tabs lazily on tab events, through APIs that need
    // the permission, so giving it back strands every open tab of that host with
    // its content still hidden until a reload.
    websiteActions.deleteItem(id);
    checkAllPermissions(getState());
  },
  toggleEnabled: (id) => {
    websiteActions.toggleEnabled(id);
    checkAllPermissions(getState());
  },
};

const UNPERMISSIONED_WARNING =
  "Content on this website won't be filtered until you grant Filter Bubble permission to access it";

const itemDetails =
  (unpermissionedIds) =>
  ({ addresses, id, selectors }) => (
    <>
      <span className="websites__addresses">
        {unpermissionedIds.includes(id) && (
          <span
            aria-label={UNPERMISSIONED_WARNING}
            className="websites__warning"
            role="img"
            title={UNPERMISSIONED_WARNING}
          >
            ⚠️
          </span>
        )}
        {unsplit(addresses)}
      </span>
      <span className="websites__selectors-label">Selectors:</span>
      <span className="websites__selectors">{unsplit(selectors)}</span>
    </>
  );

export const Websites = ({ list, unpermissionedIds = [] }) => (
  <Collection
    actions={actions}
    callback={callback}
    fields={fields}
    itemDetails={itemDetails(unpermissionedIds)}
    list={list}
    transform={transform}
  />
);
