export const checkboxField = ({ hint, label, name, value }) => (
  <div className="form__field" key={name}>
    <label className="form__label">
      <input
        defaultChecked={value}
        className="form__input"
        name={name}
        type="checkbox"
      />
      {label}
    </label>
    {hint && <aside className="form__hint">{hint}</aside>}
  </div>
);

// Tie the visible label to the field it names, so it is announced with the
// field rather than being a caption that only sighted users can connect to it,
// and so clicking it focuses the field.
//
// `htmlFor` rather than wrapping the input the way `checkboxField` does: the
// label is styled as a block of its own above the field, which wrapping would
// undo. The id is unique because only one form is on screen at a time - the app
// renders either the topics or the websites tab, and either the add or the edit
// form - and field names are unique within a form.
const toFieldId = (name) => `field-${name}`;

export const textField = ({ hint, label, name, value }) => (
  <div className="form__field" key={name}>
    <label className="form__label" htmlFor={toFieldId(name)}>
      {label}
    </label>
    <input
      autoComplete="off"
      className="form__input"
      id={toFieldId(name)}
      name={name}
      type="text"
      defaultValue={value || ""}
    />
    {hint && <aside className="form__hint">{hint}</aside>}
  </div>
);
