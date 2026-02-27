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
  const activeTab = hash === "#websites" ? "websites" : "topics";
  const topicsClassName = `app__tab ${activeTab === "topics" ? "app__tab--active" : ""}`;
  const websitesClassName = `app__tab ${activeTab === "websites" ? "app__tab--active" : ""}`;

  return (
    <div className="app">
      {!state.hasPermissions && (
        <div className="app__permissions">
          <button onClick={handleRequestPermissionFactory(state)}>
            Click to request required permissions!
          </button>
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
      <Errors errors={state.errors} />
      {activeTab === "topics" && <Topics list={state.topics.list} />}
      {activeTab === "websites" && <Websites list={state.websites.list} />}
      <Help />
    </div>
  );
};
