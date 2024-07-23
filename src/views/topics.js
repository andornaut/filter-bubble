import { html } from 'lit-html';

import { toId, toRoot } from '../actions/topics';
import { unsplit, toCanonicalArray } from '../helpers';
import { addFactory, editFactory, listFactory } from './factories';
import { textField } from './fields';
import { TOPICS_HINT } from './hints';

const fields = (topic = { text: '' }) =>
  textField({
    hint: TOPICS_HINT,
    label: 'Topics',
    name: 'text',
    value: unsplit(topic.text),
  });

const transform = (data) => {
  data.text = toCanonicalArray((data.text || '').toLowerCase());
  // The form allows submission of whitespace-only values. We .trim() after submission, therefore we must
  // validate this case.
  if (!data.text.length) {
    throw new Error('Please fill in the "Text" field');
  }
  return data;
};

const add = addFactory(toRoot, toId, transform, fields);

const edit = editFactory(toRoot, toId, transform, fields);

const details = ({ text }) => html` <span class="topics__text">${unsplit(text)}</span> `;

const list = listFactory(toRoot, toId, details);

export const topics = (state) => html`
  <section>
    <div class="selected">${state.topics.selected ? edit(state.topics.selected) : add()}</div>
    ${list(state)}
  </section>
`;
