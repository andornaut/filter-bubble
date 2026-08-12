# Container for the end-to-end suite: a real Chromium running the real built
# extension. Pinned to the Playwright release in package.json, because the image
# ships the browser build that release expects.
#
#   docker build -f tests/e2e/Dockerfile -t filter-bubble-e2e .
#   docker run --rm --ipc=host filter-bubble-e2e
#
# `--ipc=host` is Playwright's recommendation for Chromium: the default 64MB
# /dev/shm makes Chromium crash on larger pages.
FROM mcr.microsoft.com/playwright:v1.56.1-noble

WORKDIR /app

# Browsers and their OS dependencies are already in the image.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Extensions load only into a headed browser, so the suite runs under Xvfb.
CMD ["npm", "run", "test:e2e"]
