import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { EXTENSION_DIR, PROFILES_DIR, ROOT_DIR } from "./helpers/paths.js";

// The shipped manifest asks for `<all_urls>` as an *optional* host permission,
// which a user grants through a native Chrome dialog that no automation can
// click. The tests instead pre-grant the fixture server's origins only, by
// adding them as required `host_permissions` in this throwaway copy of the
// build. Everything else - including `optional_host_permissions` - is the
// shipped manifest verbatim, so the permission-gated code paths still run; they
// just find the grant already in place, exactly as they would after a user had
// clicked "Allow".
// Any-scheme patterns, matching what the extension asks for: it derives
// `*://<address>/*` from each website, and `permissions.contains` honors
// subsumption, so a narrower `http://` grant would read as not granted.
const FIXTURE_ORIGINS = ["*://localhost/*", "*://127.0.0.1/*"];

// Build `dist/` and copy it to a scratch directory with the fixture host
// permission pre-granted. Returns the directory Chrome should load.
export const buildExtension = () => {
  execFileSync("node", ["build.mjs"], { cwd: ROOT_DIR, stdio: "inherit" });

  rmSync(EXTENSION_DIR, { force: true, recursive: true });
  mkdirSync(EXTENSION_DIR, { recursive: true });
  cpSync(path.join(ROOT_DIR, "dist"), EXTENSION_DIR, { recursive: true });

  const manifestPath = path.join(EXTENSION_DIR, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.host_permissions = FIXTURE_ORIGINS;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  // Each test gets a fresh profile; drop any left behind by an interrupted run
  // so a stale `storage.sync` cannot leak into a new one.
  rmSync(PROFILES_DIR, { force: true, recursive: true });
  mkdirSync(PROFILES_DIR, { recursive: true });

  return EXTENSION_DIR;
};

export default buildExtension;
