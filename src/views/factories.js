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
  toggleShowHelp,
} from '../actions/factories';
import { humanDate } from '../date';
import { sortByModifiedDateDesc } from '../helpers';

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

const withError = (fn) => async (...args) => {
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

const handleSubmitFactory = (submit) =>
  withError((event) => {
    event.preventDefault();
    const form = event.target;
    const data = formToJson(form);
    submit(data);
    form.reset();
  });

export const addFactory = (toRoot, toId, transform, fields, beforeSubmit = async () => {}) => {
  const handleCancel = handleActOnSelectedFactory(cancelSelectedFactory(toRoot));
  const handleSubmit = handleSubmitFactory((data) => {
    data = transform(data);
    addItemFactory(toRoot, toId)(data);
    beforeSubmit(data);
  });
  return () => html`
    <form class="form" @submit=${handleSubmit}>
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

export const editFactory = (toRoot, toId, transform, fields, beforeSubmit = async () => {}) => {
  const handleCancel = handleActOnSelectedFactory(cancelSelectedFactory(toRoot));
  const handleDelete = handleActOnSelectedFactory(deleteSelectedFactory(toRoot, toId));
  const handleSubmit = handleSubmitFactory((data) => {
    data = transform(data);
    editSelectedFactory(toRoot, toId)(data);
    beforeSubmit(data);
  });
  return (selected) => html`
    <form class="form" @submit=${handleSubmit}>
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
          <div class="list__details">
            ${details(item)}
          </div>
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

const HELP_HTML = html`
  <div class="list__help">
    <h2>Getting started!</h2>
    <ol>
      <li>
        Create a list of <a href="#topics">topics</a> that you want to hide or remove from
        <a href="#websites">specific websites</a>
      </li>

      <li>
        <a href="#websites">Configure rules for these websites</a> by specifying
        <a href="https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_selectors" target="_blank">CSS selectors</a>
        that target the
        <a href="https://developer.mozilla.org/en-US/docs/Web/HTML/Element" target="_blank">HTML elements</a>
        of the content blocks or feed items that might contain any of the targeted topics
      </li>

      <li>
        If a targeted topic appears in a targeted HTML element on a targeted website, then it'll be hidden or removed
        from view
      </li>
    </ol>
    <p>
      n.b. Only a handful of <a href="#websites">websites are configured out of the box</a>, and you'll need to know how
      to target
      <a href="https://developer.mozilla.org/en-US/docs/Web/HTML/Element" target="_blank">HTML elements</a> using
      <a href="https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_selectors" target="_blank">CSS selectors</a>
      in order to configure additional websites!
    </p>
  </div>
`;

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
      return html`
        <div class="list">${HELP_HTML}</div>
      `;
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
