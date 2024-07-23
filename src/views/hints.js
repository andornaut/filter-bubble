import { html } from 'lit-html';

// App

export const HELP_HTML = html`
  <div class="list__help">
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

export const PERMISSIONS_HINT = html`
  <p>
    <b>Click above to grant access</b> to all of the <a href="#websites">configured websites</a>, which is needed in
    order to hide or remove content from those websites.
  </p>
  <p>
    If you don't want to grant access to any of those websites, then delete them on the
    <a href="#websites">"Websites" tab</a> in order to hide this prompt.
  </p>
`;

// Topics

export const TOPICS_HINT = html`
  A list of case-insensitive keywords (single words or groups of words), separated by commas, that will be hidden or
  removed from the
  <a href="#websites">websites that you've configured</a>.
  <br />
  eg. "cupcakes, apples and oranges"
`;

// Websites

export const DOMAIN_NAMES_HINT = html`
  A list of
  <a href="https://en.wikipedia.org/wiki/Domain_name" target="_blank">domain names</a>
  (<a href="https://en.wikipedia.org/wiki/URL" target="_blank">URLs</a> without the
  <a href="https://en.wikipedia.org/wiki/List_of_URI_schemes" target="_blank">scheme</a> or
  <a href="https://en.wikipedia.org/wiki/URL#Syntax" target="_blank">path</a>), separated by commas, that target the
  websites from which to hide or remove the <a href="#topics">topics that you've configured</a>.
  <br />
  eg. Specifying "example.com" above will target "http://example.com" and "https://example.com/path/?query", etc.
`;

export const CSS_SELECTORS_HINT = html`
  A list of
  <a href="https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_selectors" target="_blank">CSS selectors</a>
  separated by commas, which are used to target
  <a href="https://developer.mozilla.org/en-US/docs/Web/HTML/Element" target="_blank">HTML elements</a>
  on any websites that match the "web addresses" configured above. If a targeted HTML element contains a filtered topic,
  then that HTML element will be hidden/removed.
`;

export const HIDE_OR_REMOVE_HINT = `
  If checked, targeted HTML elements that contain a filtered "topic" will be hidden instead of removed.
  Enabling this option may result in a better experience on some websites that load content dynamically.
`;
