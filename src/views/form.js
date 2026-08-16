import { useEffect, useRef } from "react";

import { humanDate, toIsoDate, toSortDate } from "../helpers";
import { withError } from "./with-error";

const formToJson = (form) =>
  Array.from(form.elements).reduce((acc, input) => {
    const { name, type, value } = input;
    if (!name || value === "") {
      return acc;
    }
    acc[name] = type === "checkbox" ? input.checked : value.trim();
    return acc;
  }, {});

export const AddForm = ({
  addItem,
  callback = () => {},
  cancelSelected,
  fields,
  transform,
}) => {
  const formRef = useRef(null);
  const handleCancel = withError(() => {
    cancelSelected();
    formRef.current.reset();
  });
  const handleSubmit = withError((event) => {
    event.preventDefault();
    const data = transform(formToJson(formRef.current));
    addItem(data);
    callback(data);
    formRef.current.reset();
  });
  return (
    <form ref={formRef} onSubmit={handleSubmit}>
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

export const EditForm = ({
  callback = () => {},
  cancelSelected,
  deleteSelected,
  editSelected,
  fields,
  selected,
  transform,
}) => {
  const formRef = useRef(null);
  // Set on the first keystroke or checkbox click, and never cleared: the form
  // is remounted per selection (see `key` in ./collection), so it starts clean
  // for each item.
  const dirtyRef = useRef(false);

  // React updates each input's `defaultValue`, but the DOM keeps showing the
  // value it already has, so an item rewritten on another device leaves this
  // form holding the previous one and Save writes that back under a newer
  // clock, reverting the rewrite on both devices. Resetting adopts the new
  // defaults. A form the user has typed into is left alone: the edit on screen
  // is theirs, and overwriting the other device is then their own decision.
  useEffect(() => {
    if (!dirtyRef.current) {
      formRef.current.reset();
    }
    // `modifiedDate` rather than `selected`: statezero returns a new object on
    // every commit, and only an edit moves the clock.
  }, [selected.modifiedDate]);

  const handleCancel = withError(() => {
    cancelSelected();
    formRef.current.reset();
  });
  const handleDelete = withError(() => {
    deleteSelected();
    formRef.current.reset();
  });
  const handleSubmit = withError((event) => {
    event.preventDefault();
    const data = transform(formToJson(formRef.current));
    editSelected(data);
    callback(data);
    formRef.current.reset();
  });
  return (
    <form
      ref={formRef}
      onInput={() => {
        dirtyRef.current = true;
      }}
      onSubmit={handleSubmit}
    >
      {fields(selected)}
      <time
        className="form__date"
        // Omit rather than emit a value the HTML datetime format rejects.
        dateTime={toIsoDate(toSortDate(selected)) || undefined}
      >
        <span className="form__date-label">Last updated:</span>{" "}
        {humanDate(toSortDate(selected))}
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
        <button
          className="btn btn--danger"
          onClick={handleDelete}
          type="button"
        >
          Delete
        </button>
      </div>
    </form>
  );
};
