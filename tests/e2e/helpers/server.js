import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

import { SITE_DIR } from "./paths.js";

const CONTENT_TYPES = {
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
};

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
      .then((stats) => {
        if (!stats.isFile()) {
          throw new Error("Not a file");
        }
        res.writeHead(200, {
          "cache-control": "no-store",
          "content-type":
            CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        });
        createReadStream(filePath).pipe(res);
      })
      .catch(() => {
        res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
      });
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  return {
    close: () => new Promise((resolve) => server.close(resolve)),
    origin: (host = "localhost") => `http://${host}:${port}`,
    port,
    url: (pathname, host = "localhost") =>
      `http://${host}:${port}/${pathname.replace(/^\//, "")}`,
  };
};
