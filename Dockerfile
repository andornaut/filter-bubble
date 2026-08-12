# The image the end-to-end suite runs in, locally and in CI, so that "works on
# my machine" and "passes on the runner" are the same claim. See
# tests/e2e/README.md.
#
# The tag has to match the `@playwright/test` version in package.json: the image
# ships the browser build that version of Playwright expects, which is the whole
# reason for using it rather than installing Chromium onto a bare image.
ARG PLAYWRIGHT_VERSION=1.56.1
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble

# The image ships a Node of its own, which is not the one this project pins.
# Install the pinned one over it so the suite runs on the same Node as the
# build, the linter and the unit tests.
#
# The gzip tarball rather than the smaller xz one: the image ships no `xz`, and
# a download that needs no extra package keeps this to a single step.
COPY .nvmrc /tmp/.nvmrc
RUN NODE_VERSION="$(tr -d 'v \n' < /tmp/.nvmrc)" \
  && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz" \
    | tar -xz -C /usr/local --strip-components=1 \
      --exclude=CHANGELOG.md --exclude=LICENSE --exclude=README.md \
  && rm /tmp/.nvmrc \
  && node --version

WORKDIR /app

# Dependencies in their own layer, so editing a source file does not reinstall
# them.
COPY package.json package-lock.json ./
RUN npm ci

# The image tag above and the installed Playwright have to be the same version,
# or the browser build on disk is not the one Playwright goes looking for. A
# dependency bump moves one and not the other, so say so here, at the point it
# happens, rather than leaving it to a missing-executable error at test time.
ARG PLAYWRIGHT_VERSION
RUN INSTALLED="$(node -p "require('@playwright/test/package.json').version")" \
  && if [ "$INSTALLED" != "$PLAYWRIGHT_VERSION" ]; then \
    echo "Playwright is $INSTALLED but this image is built on v$PLAYWRIGHT_VERSION." >&2; \
    echo "Set PLAYWRIGHT_VERSION in the Dockerfile to $INSTALLED." >&2; \
    exit 1; \
  fi

COPY . .

# The suite itself, not the `test:e2e` wrapper that starts this container.
CMD ["npm", "run", "test:e2e:direct"]
