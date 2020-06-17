import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat';

import { clearError, toId } from '../actions/errors';
import { sortByModifiedDateDesc } from '../helpers';

const handleDelete = (event) => {
  const { id } = event.target.dataset;
  clearError(id);
};

const clearLabelText = 'Clear message';

const item = ({ message }) => html`
  <li class="errors__item">
    ${message}
    <button
      aria-label=${clearLabelText}
      @click=${handleDelete}
      class="btn errors__delete"
      data-id=${message}
      title=${clearLabelText}
    >
      🗙
    </button>
  </li>
`;

export const errors = ({ errors: list = [] }) =>
  (!list.length
    ? null
    : html`
        <ul class="errors">
          ${repeat(sortByModifiedDateDesc(list), toId, item)}
        </ul>
      `);
