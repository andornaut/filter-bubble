import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat';

import { clearError, toId } from '../actions/errors';
import { sortByModifiedDateDesc } from '../helpers';

const CLEAR_LABEL = 'Clear message';

const handleDelete = (event) => {
  const { id } = event.target.dataset;
  clearError(id);
};

const itemTemplate = ({ message }) => html`
  <li class="errors__item">
    ${message}
    <button
      aria-label=${CLEAR_LABEL}
      @click=${handleDelete}
      class="btn errors__delete"
      data-id=${message}
      title=${CLEAR_LABEL}
    >
      [x]
    </button>
  </li>
`;

export const errors = ({ errors: list = [] }) =>
  (!list.length
    ? null
    : html`
        <ul class="errors">
          ${repeat(sortByModifiedDateDesc(list), toId, itemTemplate)}
        </ul>
      `);
