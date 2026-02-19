export const checkboxField = ({ hint, label, name, value }) => (
  <div className="form__field">
    <label className="form__label">
      <input defaultChecked={value} className="form__input" name={name} type="checkbox" />
      {label}
    </label>
    {hint && <aside className="form__hint">{hint}</aside>}
  </div>
);

export const textField = ({ hint, label, name, value }) => (
  <div className="form__field">
    <label className="form__label">{label}</label>
    <input autoComplete="off" className="form__input" name={name} type="text" defaultValue={value || ""} />
    {hint && <aside className="form__hint">{hint}</aside>}
  </div>
);
