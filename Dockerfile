# Serves the simulation page and the test console. No dependencies are
# installed: the server and every suite use nothing but node builtins and
# fetch, so there is no install step to fail and nothing in the image beyond
# the code that runs.
FROM node:22-alpine

WORKDIR /app

# The page every client loads, and the console UI.
COPY server.mjs ./server.mjs
COPY page ./page
COPY console ./console

# The suites the console runs. Playwright is deliberately absent: no browsers
# are installed here, and adding them costs about a gigabyte for something that
# belongs on a machine with a screen.
COPY attacker ./attacker
COPY verify ./verify

# Built app binaries, when the operator has produced them. Empty otherwise —
# the console reports them as missing rather than hiding the section.
COPY downloads ./downloads

# The suites read credentials with `node --env-file=.env`, which fails if the
# file is absent. Coolify injects the real values as environment variables, so
# this only needs to exist, not to contain anything.
RUN touch .env

ENV PORT=3000
EXPOSE 3000

USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "server.mjs"]
