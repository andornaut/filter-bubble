import { useRef } from "react";

import { humanDate } from "../helpers";
import { withError } from "./with-error";

const formToJson = (form) =>
  Array.from(form.elements).reduce((acc, input) => {
    const { name, type, value } = input;
    if (!name || value === "") return acc;
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
    <form ref={formRef} onSubmit={handleSubmit}>
      {fields(selected)}
      <time className="form__date" dateTime={selected.modifiedDate}>
        <span className="form__date-label">Last updated:</span>{" "}
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
