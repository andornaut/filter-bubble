ARG NODE_VERSION=24.21.0
FROM node:${NODE_VERSION}

ENV HUSKY=0
WORKDIR /opt/dependencies
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tests/container/check /opt/check/run
