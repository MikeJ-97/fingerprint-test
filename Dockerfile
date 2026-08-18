# Serves page/ only. No dependencies are installed: the server uses nothing but
# node builtins, so there is no install step to fail and nothing in the image
# beyond the page and 60 lines of server.
FROM node:22-alpine

WORKDIR /app
COPY server.mjs ./server.mjs
COPY page ./page

ENV PORT=3000
EXPOSE 3000

# Runs unprivileged; the base image ships a `node` user for exactly this.
USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "server.mjs"]
