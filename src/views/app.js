import { html } from 'lit-html';
import { classMap } from 'lit-html/directives/class-map';

import { errors } from './errors';
import { topics } from './topics';
import { websites } from './websites';

export const app = (state, hash) => {
  hash = hash || '#topics';
  const showTopics = hash === '#topics';
  const showWebsites = hash === '#websites';
  const topicsClasses = { app__tab: true, 'app__tab--active': showTopics };
  const websitesClasses = { app__tab: true, 'app__tab--active': showWebsites };
  return html`
    <div class="app">
      <nav class="app__nav">
        <a class=${classMap(topicsClasses)} href="#topics">Topics</a>
        <a class=${classMap(websitesClasses)} href="#websites">Websites</a>
      </nav>
      ${errors(state)} ${showTopics ? topics(state) : null} ${showWebsites ? websites(state) : null}
    </div>
  `;
};
