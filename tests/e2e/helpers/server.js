import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

import { SITE_DIR } from "./paths.js";

const CONTENT_TYPES = {
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
};

// Pages under `site/csp/` are served with a policy that forbids inline styles,
// which is the case the extension injects its stylesheet through
// `chrome.scripting.insertCSS` for: a content script adding a <style> of its
// own would be blocked here.
const CSP_PREFIX = "/csp/";
const CSP = "default-src 'self'; style-src 'self'";

// Pages under `site/slow/` are sent in two parts: everything up to the marker,
// then the rest after a pause. The content script is injected as soon as the
// navigation commits, so it starts against a document that has a
// documentElement but no body yet.
const SLOW_PREFIX = "/slow/";
const SLOW_MARKER = "<!--LATER-->";
const SLOW_DELAY_MS = 600;

// Serve `tests/e2e/site` over HTTP. The extension matches websites by address,
// so the fixture pages have to be reachable at a real host name rather than
// from `file://`. `localhost` is the site under test and `127.0.0.1` is the
// same content at an address no test website matches, which gives the suite a
// second "website" to assert non-interference against.
export const startServer = async () => {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const filePath = path.join(SITE_DIR, path.normalize(url.pathname));
    if (!filePath.startsWith(SITE_DIR)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    stat(filePath)
      .then(async (stats) => {
        if (!stats.isFile()) {
          throw new Error("Not a file");
        }
        const headers = {
          "cache-control": "no-store",
          "content-type":
            CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        };
        if (url.pathname.startsWith(CSP_PREFIX)) {
          headers["content-security-policy"] = CSP;
        }
        res.writeHead(200, headers);

        if (url.pathname.startsWith(SLOW_PREFIX)) {
          const [head, rest = ""] = (await readFile(filePath, "utf8")).split(
            SLOW_MARKER,
          );
          res.write(head);
          setTimeout(() => res.end(rest), SLOW_DELAY_MS);
          return;
        }
        createReadStream(filePath).pipe(res);
      })
      .catch(() => {
        res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
      });
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  return {
    // `close()` stops the server accepting new connections but waits for the
    // open ones to end, and a browser keeps its sockets alive for reuse rather
    // than closing them after a response. This server is worker-scoped, so
    // closing it means the worker's last test is done and nothing is in
    // flight: drop the sockets rather than hold the worker's teardown open for
    // the length of a keep-alive timeout.
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
    origin: (host = "localhost") => `http://${host}:${port}`,
    port,
    url: (pathname, host = "localhost") =>
      `http://${host}:${port}/${pathname.replace(/^\//, "")}`,
  };
};
