import { requestPermissionsFromState } from "../permissions";
import { Errors } from "./errors";
import { Help } from "./help";
import { PERMISSIONS_HINT } from "./hints";
import { Topics } from "./topics";
import { Websites } from "./websites";

const handleRequestPermissionFactory = (state) => (event) => {
  event.preventDefault();
  requestPermissionsFromState(state);
};

export const App = ({ hash, state }) => {
  hash = hash || "#topics";
  const showTopics = hash === "#topics";
  const showWebsites = hash === "#websites";
  const topicsClassName = `app__tab ${showTopics ? "app__tab--active" : ""}`;
  const websitesClassName = `app__tab ${showWebsites ? "app__tab--active" : ""}`;

  return (
    <div className="app">
      {!state.hasPermissions && (
        <div className="app__permissions">
          <button onClick={handleRequestPermissionFactory(state)}>Click to request required permissions!</button>
          {PERMISSIONS_HINT}
        </div>
      )}
      <nav className="app__nav">
        <a className={topicsClassName} href="#topics">
          Topics
        </a>
        <a className={websitesClassName} href="#websites">
          Websites
        </a>
      </nav>
      <Errors state={state} />
      {showTopics && <Topics state={state} />}
      {showWebsites && <Websites state={state} />}
      <Help showHelp={state.showHelp} />
    </div>
  );
};
