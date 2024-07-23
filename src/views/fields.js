import { html } from 'lit-html';

export const checkboxField = ({
  hint, label, name, value,
}) => html`
  <div class="form__field">
    <label class="form__label">
      <input class="form__input" name=${name} type="checkbox" ?checked=${value} />
      ${label}
    </label>
    ${!hint ? null : html` <aside class="form__hint">${hint}</aside> `}
  </div>
`;

export const textField = ({
  hint, label, name, value,
}) => html`
  <div class="form__field">
    <label class="form__label">${label}</label>
    <input autocomplete="off" class="form__input" name=${name} type="text" .value=${value || ''} />
    ${!hint ? null : html` <aside class="form__hint">${hint}</aside> `}
  </div>
`;
