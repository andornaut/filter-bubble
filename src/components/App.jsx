import React from 'react';
import { requestPermissionsFromState } from '../permissions';
import ErrorList from './ErrorList';
import Topics from './Topics';
import Websites from './Websites';
import { PERMISSIONS_HINT } from './Hints';

const App = ({ state, setState, hash }) => {
  const showTopics = hash === '#topics';
  const showWebsites = hash === '#websites';

  const handleRequestPermission = (event) => {
    event.preventDefault();
    requestPermissionsFromState(state);
  };

  return (
    <div className="app">
      {!state.hasPermissions && (
        <div className="app__permissions">
          <button onClick={handleRequestPermission}>Click to request required permissions!</button>
          <div>{PERMISSIONS_HINT}</div>
        </div>
      )}

      <nav className="app__nav">
        <a className={`app__tab ${showTopics ? 'app__tab--active' : ''}`} href="#topics">
          Topics
        </a>
        <a className={`app__tab ${showWebsites ? 'app__tab--active' : ''}`} href="#websites">
          Websites
        </a>
      </nav>

      <ErrorList state={state} setState={setState} />

      {showTopics && <Topics state={state} setState={setState} />}
      {showWebsites && <Websites state={state} setState={setState} />}
    </div>
  );
};

export default App;
