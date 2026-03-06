FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

ENV WXT_DEV_SERVER_PORT=4173

RUN apt-get update \
  && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g npm@latest

