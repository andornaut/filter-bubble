import { html } from 'lit-html';

import { toId, toRoot, transform } from '../actions/websites';
import { unsplit } from '../helpers';
import { addFactory, listFactory, editFactory } from './factories';
import { checkboxField, textField } from './fields';

const fields = (website = { addresses: '', hideInsteadOfRemove: false, selectors: '' }) => [
  textField({
    hint: html`
      A list of "web addresses" (prefixes, without the
      <a href="https://en.wikipedia.org/wiki/List_of_URI_schemes" target="_blank">URI scheme</a>) separated by commas,
      which are used to target websites to filter for the <a href="#topics">topics that you've configured</a>. eg.
      "example.com" above will filter content from http://example.com and https://example.com/path/?query
    `,
    label: 'Web addresses',
    name: 'addresses',
    value: unsplit(website.addresses),
  }),
  textField({
    hint: html`
      A list of
      <a href="https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_selectors" target="_blank">CSS selectors</a>
      separated by commas, which are used to target
      <a href="https://developer.mozilla.org/en-US/docs/Web/HTML/Element" target="_blank">HTML elements</a>
      on any websites that match the "web addresses" configured above. If a targetted HTML element contains a filtered
      <a href="#topics">topic</a>, then that HTML element will be hidden/removed.
    `,
    label: 'CSS selectors',
    name: 'selectors',
    value: unsplit(website.selectors),
  }),
  checkboxField({
    hint:
      'If checked, targetted HTML elements that contain a filtered "topic" will be hidden instead of removed. '
      + 'Enabling this option may result in a better experience on some websites that load content dynamically.',
    label: 'Hide instead of remove',
    name: 'hideInsteadOfRemove',
    value: website.hideInsteadOfRemove,
  }),
];

const add = addFactory(toRoot, toId, transform, fields);

const edit = editFactory(toRoot, toId, transform, fields);

const details = ({ addresses, selectors }) => html`
  <span class="websites__addresses">${unsplit(addresses)}</span>
  <span class="websites__selectors-label">Selectors:</span>
  <span class="websites__selectors">${unsplit(selectors)}</span>
`;

const emptyText = html`
  <p class="list__empty">Configure JavaScript "query selectors" to target website content for filtering.</p>
`;

const list = listFactory(toRoot, toId, emptyText, details);

export const websites = (state) => html`
  <section>
    <div class="selected">${state.websites.selected ? edit(state.websites.selected) : add()}</div>
    ${list(state)}
  </section>
`;
