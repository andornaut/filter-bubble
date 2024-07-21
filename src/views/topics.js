import { html } from 'lit-html';

import { toId, toRoot, transform } from '../actions/topics';
import { unsplit } from '../helpers';
import { addFactory, editFactory, listFactory } from './factories';
import { textField } from './fields';

const fields = (topic = { text: '' }) =>
  textField({
    hint: html`
      A list of case-insensitive topics - words or phrases - that will be hidden or removed from the
      <a href="#websites">websites that you've configured</a>. eg. "cupcakes, apples and oranges"
    `,
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
  <p class="list__empty">
    Start by <a href="#websites">configuring the websites</a> that you want to filter, then add "topics" above to start
    curating your web browsing bubble!
    <br />
    <br />
    n.b. Only a handful of websites are configured by default, and you'll need to know how to target
    <a href="https://developer.mozilla.org/en-US/docs/Web/HTML/Element" target="_blank">HTML elements</a> using
    <a href="https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_selectors" target="_blank">CSS selectors</a>
    in order to properly configure new websites!
  </p>
`;

const list = listFactory(toRoot, toId, emptyText, details);

export const topics = (state) => html`
  <section>
    <div class="selected">${state.topics.selected ? edit(state.topics.selected) : add()}</div>
    ${list(state)}
  </section>
`;
