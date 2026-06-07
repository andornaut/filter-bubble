import {
  addWebsite,
  deleteWebsite,
  editWebsite,
  toggleWebsiteEnabled,
  toId,
} from "../actions/websites";
import { toCanonicalArray, unsplit } from "../helpers";
import { useSelection } from "../hooks/useSelection";
import { requestPermissionsFromAddresses } from "../permissions";
import { DOMAIN_NAME_REGEX, SCHEME_REGEX } from "../validation";
import { checkboxField, textField } from "./fields";
import { AddForm, EditForm } from "./form";
import {
  CSS_SELECTORS_HINT,
  DOMAIN_NAMES_HINT,
  HIDE_OR_REMOVE_HINT,
} from "./hints";
import { List } from "./list";

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

const itemDetails = ({ addresses, selectors }) => (
  <>
    <span className="websites__addresses">{unsplit(addresses)}</span>
    <span className="websites__selectors-label">Selectors:</span>
    <span className="websites__selectors">{unsplit(selectors)}</span>
  </>
);

export const Websites = ({ list }) => {
  const { clearSelected, handleSelect, selected, selectedId } = useSelection(
    list,
    toId,
  );
  const handleDelete = () => {
    deleteWebsite(selectedId);
    clearSelected();
  };
  const handleEdit = (data) => {
    editWebsite(selectedId, data);
    clearSelected();
  };

  return (
    <section>
      <div className="form">
        {selected ? (
          <EditForm
            callback={callback}
            cancelSelected={clearSelected}
            deleteSelected={handleDelete}
            editSelected={handleEdit}
            fields={fields}
            selected={selected}
            transform={transform}
          />
        ) : (
          <AddForm
            addItem={addWebsite}
            callback={callback}
            cancelSelected={clearSelected}
            fields={fields}
            transform={transform}
          />
        )}
      </div>
      <List
        itemDetails={itemDetails}
        list={list}
        select={handleSelect}
        selectedId={selectedId}
        toId={toId}
        toggleEnabled={toggleWebsiteEnabled}
      />
    </section>
  );
};
