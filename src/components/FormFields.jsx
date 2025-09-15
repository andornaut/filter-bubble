import React from 'react';

export const TextField = ({ label, name, value, onChange, hint }) => (
  <div className="form__field">
    <label className="form__label">{label}</label>
    <input autoComplete="off" className="form__input" name={name} type="text" value={value || ''} onChange={onChange} />
    {hint && <aside className="form__hint">{hint}</aside>}
  </div>
);

export const CheckboxField = ({ label, name, checked, onChange, hint }) => (
  <div className="form__field">
    <label className="form__label">
      <input className="form__input" name={name} type="checkbox" checked={checked || false} onChange={onChange} />
      {label}
    </label>
    {hint && <aside className="form__hint">{hint}</aside>}
  </div>
);
