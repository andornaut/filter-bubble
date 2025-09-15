import React, { useState } from 'react';
import { TextField, CheckboxField } from './FormFields';
import { CSS_SELECTORS_HINT, DOMAIN_NAMES_HINT, HIDE_OR_REMOVE_HINT, HelpContent } from './Hints';
import {
  addWebsite,
  editWebsite,
  deleteWebsite,
  selectWebsite,
  toggleWebsiteEnabled,
  cancelSelectedWebsite,
  toWebsiteId,
  addError,
  clearAllErrors,
  toggleShowHelp,
} from '../state/actions';
import { toCanonicalArray, unsplit, sortByModifiedDateDesc, humanDate } from '../helpers';
import { requestPermissionsFromAddresses } from '../permissions';

const DOMAIN_NAME_REGEX = /^[a-z\d]([a-z\d-]{0,61}[a-z\d])(\.[a-z\d]([a-z\d-]{0,61}[a-z\d])?)*$/i;
const SCHEME_REGEX = /^(https?)?:\/\//;

const Websites = ({ state, setState }) => {
  const [formData, setFormData] = useState({
    addresses: '',
    selectors: '',
    hideInsteadOfRemove: false,
  });

  const { websites } = state;
  const { list = [], selected } = websites;
  const isEditing = !!selected;

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const transformWebsiteData = (data) => {
    let addresses = toCanonicalArray(data.addresses);
    const selectors = toCanonicalArray(data.selectors);

    addresses = addresses.map((address) => {
      const domainName = address.toLowerCase().replace(SCHEME_REGEX, '');
      if (!domainName.match(DOMAIN_NAME_REGEX)) {
        throw new Error(`"${address}" isn't a valid domain name`);
      }
      return domainName;
    });

    // Remove duplicates that might have been created by removing schemes
    addresses = Array.from(new Set(addresses));

    if (addresses.length === 0) {
      throw new Error('Please fill in the "Domain names" field');
    }
    if (selectors.length === 0) {
      throw new Error('Please fill in the "CSS Selectors" field');
    }

    return {
      ...data,
      addresses,
      selectors,
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const transformedData = transformWebsiteData(formData);

      if (isEditing) {
        editWebsite(setState, transformedData, selected);
      } else {
        addWebsite(setState, transformedData);
      }

      // Request permissions for the addresses
      requestPermissionsFromAddresses(transformedData.addresses);

      setFormData({
        addresses: '',
        selectors: '',
        hideInsteadOfRemove: false,
      });
      clearAllErrors(setState);
    } catch (error) {
      console.warn(error);
      addError(setState, error.message);
    }
  };

  const handleCancel = () => {
    cancelSelectedWebsite(setState);
    setFormData({
      addresses: '',
      selectors: '',
      hideInsteadOfRemove: false,
    });
  };

  const handleDelete = () => {
    try {
      deleteWebsite(setState, selected);
      setFormData({
        addresses: '',
        selectors: '',
        hideInsteadOfRemove: false,
      });
      clearAllErrors(setState);
    } catch (error) {
      console.warn(error);
      addError(setState, error.message);
    }
  };

  const handleSelectWebsite = (id) => {
    const website = list.find((w) => toWebsiteId(w) === id);
    if (website) {
      selectWebsite(setState, id);
      setFormData({
        addresses: unsplit(website.addresses),
        selectors: unsplit(website.selectors),
        hideInsteadOfRemove: website.hideInsteadOfRemove || false,
      });
    }
  };

  const handleToggleEnabled = (id) => {
    toggleWebsiteEnabled(setState, id);
  };

  const handleToggleHelp = (e) => {
    e.preventDefault();
    toggleShowHelp(setState);
  };

  // Update form data when editing mode changes
  React.useEffect(() => {
    if (isEditing && selected) {
      setFormData({
        addresses: unsplit(selected.addresses),
        selectors: unsplit(selected.selectors),
        hideInsteadOfRemove: selected.hideInsteadOfRemove || false,
      });
    } else if (!isEditing) {
      setFormData({
        addresses: '',
        selectors: '',
        hideInsteadOfRemove: false,
      });
    }
  }, [isEditing, selected]);

  return (
    <section>
      <div className="form">
        <form onSubmit={handleSubmit}>
          <TextField
            label="Domain names"
            name="addresses"
            value={formData.addresses}
            onChange={handleInputChange}
            hint={DOMAIN_NAMES_HINT}
          />

          <TextField
            label="CSS selectors"
            name="selectors"
            value={formData.selectors}
            onChange={handleInputChange}
            hint={CSS_SELECTORS_HINT}
          />

          <CheckboxField
            label="Hide instead of remove"
            name="hideInsteadOfRemove"
            checked={formData.hideInsteadOfRemove}
            onChange={handleInputChange}
            hint={HIDE_OR_REMOVE_HINT}
          />

          {isEditing && (
            <time className="form__date" dateTime={selected.modifiedDate}>
              <span className="form__date-label">Last updated:</span>
              {humanDate(selected.modifiedDate)}
            </time>
          )}

          <div className="form__actions-container">
            <div className="form__actions-primary">
              <button className="btn btn--primary" type="submit">
                {isEditing ? 'Save' : 'Add'}
              </button>
              <button onClick={handleCancel} className="btn" type="button">
                Cancel
              </button>
            </div>
            {isEditing && (
              <button onClick={handleDelete} className="btn btn--danger" type="button">
                Delete
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="list">
        {!list.length ? (
          <HelpContent />
        ) : (
          <>
            <ul>
              {sortByModifiedDateDesc(list).map((website) => {
                const id = toWebsiteId(website);
                const isSelected = selected && toWebsiteId(selected) === id;
                const cssClasses = [
                  'list__item',
                  isSelected && 'list__item--active',
                  !website.enabled && 'list__item--disabled',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <li key={id} className={cssClasses} data-id={id}>
                    <div className="list__content" onClick={() => handleSelectWebsite(id)}>
                      <div className="list__details">
                        <span className="websites__addresses">{unsplit(website.addresses)}</span>
                        <span className="websites__selectors-label">Selectors:</span>
                        <span className="websites__selectors">{unsplit(website.selectors)}</span>
                      </div>
                    </div>
                    <button
                      className="list__toggle list__toggle-btn"
                      onClick={() => handleToggleEnabled(id)}
                      title="Toggle enabled / disabled"
                      type="button"
                    >
                      {website.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </li>
                );
              })}
            </ul>
            {state.showHelp && <HelpContent />}
            <p className="list__show-help">
              <a href="#" onClick={handleToggleHelp}>
                {state.showHelp ? 'Hide help' : 'Show help'}
              </a>
            </p>
          </>
        )}
      </div>
    </section>
  );
};

export default Websites;
