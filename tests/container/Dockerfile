ARG NODE_VERSION=24.21.0
FROM koalaman/shellcheck:v0.11.0 AS shellcheck

FROM node:${NODE_VERSION}

COPY --from=shellcheck /bin/shellcheck /usr/local/bin/shellcheck

ENV HUSKY=0
WORKDIR /opt/dependencies
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tests/container/check /opt/check/run
