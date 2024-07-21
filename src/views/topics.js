import { html } from 'lit-html';

import { toId, toRoot, transform } from '../actions/topics';
import { unsplit } from '../helpers';
import { addFactory, editFactory, listFactory } from './factories';
import { textField } from './fields';

const fields = (topic = { text: '' }) =>
  textField({
    hint: html`
      A list of case-insensitive keywords (single words or groups of words), separated by commas, that will be hidden or
      removed from the
      <a href="#websites">websites that you've configured</a>.
      <br />
      eg. "cupcakes, apples and oranges"
    `,
    label: 'Topics',
    name: 'text',
    value: unsplit(topic.text),
  });

const add = addFactory(toRoot, toId, transform, fields);

const edit = editFactory(toRoot, toId, transform, fields);

const details = ({ text }) =>
  html`
    <span class="topics__text">${unsplit(text)}</span>
  `;

const list = listFactory(toRoot, toId, details);

export const topics = (state) => html`
  <section>
    <div class="selected">${state.topics.selected ? edit(state.topics.selected) : add()}</div>
    ${list(state)}
  </section>
`;
