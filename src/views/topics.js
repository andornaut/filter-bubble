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
      <a href="#websites">websites that you've configured</a>. eg. "cupcakes, apples and oranges"
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

export const emptyText = html`
  <div class="list__empty">
    <h2>Getting started!</h2>
    <ol>
      <li>
        Create a list of <a href="#topics">topics</a> that you want to hide or remove from
        <a href="#websites">specific websites</a>
      </li>

      <li>
        <a href="#websites">Configure rules for these websites</a> by specifying
        <a href="https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_selectors" target="_blank">CSS selectors</a>
        that target the
        <a href="https://developer.mozilla.org/en-US/docs/Web/HTML/Element" target="_blank">HTML elements</a>
        of the content blocks or feed items that might contain any of the targeted topics
      </li>

      <li>
        If a targeted topic appears in a targeted HTML element on a targeted website, then it'll be hidden or removed
        from view
      </li>
    </ol>
    <p>
      n.b. Only a handful of <a href="#websites">websites are configured out of the box</a>, and you'll need to know how
      to target
      <a href="https://developer.mozilla.org/en-US/docs/Web/HTML/Element" target="_blank">HTML elements</a> using
      <a href="https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_selectors" target="_blank">CSS selectors</a>
      in order to configure additional websites!
    </p>
  </div>
`;

const list = listFactory(toRoot, toId, emptyText, details);

export const topics = (state) => html`
  <section>
    <div class="selected">${state.topics.selected ? edit(state.topics.selected) : add()}</div>
    ${list(state)}
  </section>
`;
