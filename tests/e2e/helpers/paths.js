import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const E2E_DIR = path.resolve(here, "..");
export const ROOT_DIR = path.resolve(E2E_DIR, "..", "..");
// Build output under test: a copy of `dist/` with the fixture host permission
// pre-granted. See build-extension.mjs.
const ARTIFACTS_DIR = path.join(E2E_DIR, ".artifacts");
export const EXTENSION_DIR = path.join(ARTIFACTS_DIR, "extension");
// Static pages served as the site under test.
export const SITE_DIR = path.join(E2E_DIR, "site");
