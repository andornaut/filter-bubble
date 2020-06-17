import { html } from 'lit-html';

import { toId, toRoot, transform } from '../actions/topics';
import { unsplit } from '../helpers';
import { addFactory, editFactory, listFactory } from './factories';
import { textField } from './fields';

const fields = (topic = { text: '' }) =>
  textField({
    hint: 'A list of case-insensitive topics - groups of words or phrases - that you do not wish to see on the web. '
      + 'eg. "cupcakes, apples and oranges"',
    label: 'Text',
    name: 'text',
    value: unsplit(topic.text),
  });

const add = addFactory(toRoot, toId, transform, fields);

const edit = editFactory(toRoot, toId, transform, fields);

const details = ({ text }) =>
  html`
    <span class="topics__text">${unsplit(text)}</span>
  `;

const emptyText = html`
  <p class="list__empty">Add "topics" above to start curating your web bubble!</p>
`;

const list = listFactory(toRoot, toId, emptyText, details);

export const topics = (state) => html`
  <section>
    <div class="selected">${state.topics.selected ? edit(state.topics.selected) : add()}</div>
    ${list(state)}
  </section>
`;
