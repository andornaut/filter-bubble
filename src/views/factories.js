import { addError, clearAllErrors } from "../actions/errors";
import {
  addItemFactory,
  cancelSelectedFactory,
  deleteSelectedFactory,
  editSelectedFactory,
  selectFactory,
  toggleEnabledFactory,
} from "../actions/factories";
import { toggleShowHelp } from "../actions/help";
import { humanDate, sortByModifiedDateDesc } from "../helpers";
import { HELP_HTML } from "./hints";

const formToJson = (form) =>
  [].reduce.call(
    form.elements,
    (accumulator, input) => {
      const { name, type, value } = input;
      if (value === "") {
        return accumulator;
      }
      if (type === "checkbox") {
        // Don't need to support .value on checkboxes.
        accumulator[name] = input.checked;
        return accumulator;
      }
      accumulator[name] = value.trim();
      return accumulator;
    },
    {},
  );

const withError =
  (fn) =>
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
  return () => (
    <form onSubmit={handleSubmit}>
      {fields()}
      <div className="form__actions-container">
        <div className="form__actions-primary">
          <button className="btn btn--primary" type="submit">
            Add
          </button>
          <button className="btn" onClick={handleCancel} type="button">
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
};

export const editFactory = (toRoot, toId, transform, fields, callback = () => {}) => {
  const handleCancel = handleActOnSelectedFactory(cancelSelectedFactory(toRoot));
  const handleDelete = handleActOnSelectedFactory(deleteSelectedFactory(toRoot, toId));
  const editSelected = editSelectedFactory(toRoot, toId);
  const handleSubmit = handleSubmitFactory(transform, editSelected, callback);
  return (selected) => (
    <form onSubmit={handleSubmit}>
      {fields(selected)}
      <time className="form__date" dateTime={selected.modifiedDate}>
        <span className="form__date-label">Last updated:</span>
        {humanDate(selected.modifiedDate)}
      </time>
      <div className="form__actions-container">
        <div className="form__actions-primary">
          <button className="btn btn--primary" type="submit">
            Save
          </button>
          <button className="btn" onClick={handleCancel} type="button">
            Cancel
          </button>
        </div>
        <button className="btn btn--danger" onClick={handleDelete} type="button">
          Delete
        </button>
      </div>
    </form>
  );
};

const itemFactory = (toRoot, toId, details) => {
  const handleSelect = handleClickItemFactory(selectFactory(toRoot, toId));
  const handleToggle = handleClickItemFactory(toggleEnabledFactory(toRoot, toId));
  return (item, isSelected) => {
    const id = toId(item);
    const { enabled } = item;
    const cssClasses = `list__item ${isSelected ? "list__item--active" : ""} ${
      !enabled ? "list__item--disabled" : ""
    }`.trim();
    const toggleEnabledLabel = enabled ? "Disable" : "Enable";
    return (
      <li className={cssClasses} data-id={id}>
        <div className="list__content" onClick={handleSelect}>
          <div className="list__details">{details(item)}</div>
        </div>
        <button
          className="list__toggle list__toggle-btn"
          onClick={handleToggle}
          title="Toggle enabled / disabled"
          type="button"
        >
          {toggleEnabledLabel}
        </button>
      </li>
    );
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
      return <div className="list">{HELP_HTML}</div>;
    }
    const showHelpLabel = state.showHelp ? "Hide help" : "Show help";
    return (
      <div className="list">
        <ul>
          {sortByModifiedDateDesc(list).map((item_) => {
            const key = toId(item_);
            return <li key={key}>{item(item_, selectedId === key)}</li>;
          })}
        </ul>
        {state.showHelp && HELP_HTML}
        <p className="list__show-help">
          <a href="#" onClick={handleToggleHelp}>
            {showHelpLabel}
          </a>
        </p>
      </div>
    );
  };
};
