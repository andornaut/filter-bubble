ARG NODE_VERSION=24.21.0
FROM koalaman/shellcheck:v0.11.0 AS shellcheck

FROM node:${NODE_VERSION}

COPY --from=shellcheck /bin/shellcheck /usr/local/bin/shellcheck

ENV HUSKY=0
WORKDIR /opt/dependencies
COPY package.json package-lock.json ./
# WORKAROUND: Scoped Markdown overrides fix GHSA-gg6h-894w-4m9c and GHSA-238p-pmpm-9mq7.
# Remove after upstream dependencies include patched versions.
# https://github.com/advisories/GHSA-gg6h-894w-4m9c
# https://github.com/advisories/GHSA-238p-pmpm-9mq7
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tests/container/check /opt/check/run
