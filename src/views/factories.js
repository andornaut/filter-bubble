import { html } from 'lit-html';
import { classMap } from 'lit-html/directives/class-map';
import { repeat } from 'lit-html/directives/repeat';

import { addError, clearAllErrors } from '../actions/errors';
import {
  addItemFactory,
  cancelSelectedFactory,
  deleteSelectedFactory,
  editSelectedFactory,
  selectFactory,
  toggleEnabledFactory,
} from '../actions/factories';
import { toggleShowHelp } from '../actions/help';
import { humanDate, sortByModifiedDateDesc } from '../helpers';
import { HELP_HTML } from './hints';

const formToJson = (form) =>
  [].reduce.call(
    form.elements,
    (accumulator, input) => {
      const { name, type, value } = input;
      if (value === '') {
        return accumulator;
      }
      if (type === 'checkbox') {
        // Don't need to support .value on checkboxes.
        accumulator[name] = input.checked;
        return accumulator;
      }
      accumulator[name] = value.trim();
      return accumulator;
    },
    {},
  );

const withError = (fn) =>
  async (...args) => {
    try {
      await fn(...args);
    } catch (error) {
      console.warn(error);
      addError(error);
      return;
    }
    clearAllErrors();
  };

const handleActOnSelectedFactory = (actOnSelected) =>
  withError((event) => {
    actOnSelected();
    event.target.form.reset();
  });

const handleClickItemFactory = (click) => (event) => {
  click(event.currentTarget.parentNode.dataset.id);
};

const handleSubmitFactory = (transform, submit, callback) =>
  withError((event) => {
    event.preventDefault();
    const form = event.target;
    const data = transform(formToJson(form));
    submit(data);
    callback(data);
    form.reset();
  });

export const addFactory = (toRoot, toId, transform, fields, callback = () => {}) => {
  const handleCancel = handleActOnSelectedFactory(cancelSelectedFactory(toRoot));
  const addItem = addItemFactory(toRoot, toId);
  const handleSubmit = handleSubmitFactory(transform, addItem, callback);
  return () => html`
    <form @submit=${handleSubmit}>
      ${fields()}
      <div class="form__actions-container">
        <div class="form__actions-primary">
          <button class="btn btn--primary" type="submit">Add</button>
          <button @click=${handleCancel} class="btn" type="button">Cancel</button>
        </div>
      </div>
    </form>
  `;
};

export const editFactory = (toRoot, toId, transform, fields, callback = () => {}) => {
  const handleCancel = handleActOnSelectedFactory(cancelSelectedFactory(toRoot));
  const handleDelete = handleActOnSelectedFactory(deleteSelectedFactory(toRoot, toId));
  const editSelected = editSelectedFactory(toRoot, toId);
  const handleSubmit = handleSubmitFactory(transform, editSelected, callback);
  return (selected) => html`
    <form @submit=${handleSubmit}>
      ${fields(selected)}
      <time class="form__date" datetime=${selected.modifiedDate}>
        <span class="form__date-label">Last updated:</span>
        ${humanDate(selected.modifiedDate)}
      </time>
      <div class="form__actions-container">
        <div class="form__actions-primary">
          <button class="btn btn--primary" type="submit">Save</button>
          <button @click=${handleCancel} class="btn" type="button">Cancel</button>
        </div>
        <button @click=${handleDelete} class="btn btn--danger" type="button">Delete</button>
      </div>
    </form>
  `;
};

const itemFactory = (toRoot, toId, details) => {
  const handleSelect = handleClickItemFactory(selectFactory(toRoot, toId));
  const handleToggle = handleClickItemFactory(toggleEnabledFactory(toRoot, toId));
  return (item, isSelected) => {
    const id = toId(item);
    const { enabled } = item;
    const cssClasses = classMap({
      list__item: true,
      'list__item--active': isSelected,
      'list__item--disabled': !enabled,
    });
    const toggleEnabledLabel = enabled ? 'Disable' : 'Enable';
    return html`
      <li class=${cssClasses} data-id=${id}>
        <div class="list__content" @click=${handleSelect}>
          <div class="list__details">${details(item)}</div>
        </div>
        <button
          class="list__toggle"
          @click=${handleToggle}
          class="list__toggle-btn"
          title="Toggle enabled / disabled"
          type="button"
        >
          ${toggleEnabledLabel}
        </button>
      </li>
    `;
  };
};

const handleToggleHelp = (event) => {
  event.preventDefault();
  toggleShowHelp();
};

export const listFactory = (toRoot, toId, itemDetails) => {
  const item = itemFactory(toRoot, toId, itemDetails);
  return (state) => {
    const { list, selected } = toRoot(state);
    const selectedId = toId(selected || {});
    if (!list.length) {
      return html`<div class="list">${HELP_HTML}</div>`;
    }
    const showHelpLabel = state.showHelp ? 'Hide help' : 'Show help';
    return html`
      <div class="list">
        <ul>
          ${repeat(sortByModifiedDateDesc(list), toId, (item_) => item(item_, selectedId === toId(item_)))}
        </ul>
        ${state.showHelp ? HELP_HTML : null}
        <p class="list__show-help"><a href="#" @click=${handleToggleHelp}>${showHelpLabel}</a></p>
      </div>
    `;
  };
};
