import { html } from 'lit-html';
import { classMap } from 'lit-html/directives/class-map';

import { requestPermissionsFromState } from '../permissions';
import { errors } from './errors';
import { topics } from './topics';
import { websites } from './websites';

const handleRequestPermissionFactory = (state) => (event) => {
  event.preventDefault();
  requestPermissionsFromState(state);
};

export const app = (state, hash) => {
  hash = hash || '#topics';
  const showTopics = hash === '#topics';
  const showWebsites = hash === '#websites';
  const topicsClasses = { app__tab: true, 'app__tab--active': showTopics };
  const websitesClasses = { app__tab: true, 'app__tab--active': showWebsites };
  const permissionButton = state.hasPermissions
    ? null
    : html`
        <div class="app__permissions">
          <button @click=${handleRequestPermissionFactory(state)}>Click to request required permissions!</button>
          <p>
            <b>Click above to grant access</b> to all of the <a href="#websites">configured websites</a>, which is
            needed in order to hide or remove content from those websites.
          </p>
          <p>
            If you don't want to grant access to any of those websites, then delete them on the
            <a href="#websites">"Websites" tab</a> in order to hide this prompt.
          </p>
        </div>
      `;
  return html`
    <div class="app">
      ${permissionButton}
      <nav class="app__nav">
        <a class=${classMap(topicsClasses)} href="#topics">Topics</a>
        <a class=${classMap(websitesClasses)} href="#websites">Websites</a>
      </nav>
      ${errors(state)} ${showTopics ? topics(state) : null} ${showWebsites ? websites(state) : null}
    </div>
  `;
};
