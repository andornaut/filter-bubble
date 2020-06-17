import { html } from 'lit-html';

import { toId, toRoot, transform } from '../actions/websites';
import { unsplit } from '../helpers';
import { addFactory, listFactory, editFactory } from './factories';
import { checkboxField, textField } from './fields';

const fields = (website = { addresses: '', hideInsteadOfRemove: false, selectors: '' }) => [
  textField({
    hint:
      'A list of web addresses separated by commas. '
      + 'The following URL schemes are equivalent to omitting the scheme: http://, https://, or ://. '
      + "A webpage's address matches if it starts with one of these addresses. "
      + 'eg. "example.com" matches http://example.com and https://example.com/path/?query',
    label: 'Web addresses',
    name: 'addresses',
    value: unsplit(website.addresses),
  }),
  textField({
    hint:
      'A list of "CSS Selectors" separated by commas. '
      + 'These selectors are used to target HTML elements on a webpage. '
      + 'If a "topic" is mentioned anywhere within one of these HTML elements, then it\'ll be hidden from view.',
    label: 'Selectors',
    name: 'selectors',
    value: unsplit(website.selectors),
  }),
  checkboxField({
    hint:
      'If checked, then hide matched HTML elements instead of removing them from the webpage. '
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
