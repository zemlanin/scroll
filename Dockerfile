FROM node:15-buster-slim
RUN npm set unsafe-perm true

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    rsync \
    gcc pkg-config libicu-dev icu-devtools libsqlite3-dev \
    # to install `oembed-providers` package from github
    git ca-certificates \
    # `sqlite3` npm package doesn't always have precompiled binaries
    g++ make python3 \
  && rm -rf /var/lib/apt/lists/*

COPY scripts/ ./scripts/
COPY sqlite-icu/ ./sqlite-icu/
COPY package*.json ./

RUN npm config set python $(which python3)

ENV NODE_ENV production
RUN npm ci
RUN apt-get remove -y \
    # clean up after compiling `sqlite-icu/libicu.so`
    gcc pkg-config \
    # to install `oembed-providers` package from github
    git ca-certificates \
    # `sqlite3` npm package doesn't always have precompiled binaries
    g++ make python3 \
  && apt-get autoremove -y \
  && apt-get clean

COPY *.js ./
COPY backstage/ ./backstage/
COPY static/ ./static/
COPY templates/ ./templates/
COPY migrations/ ./migrations/

ENV PORT 8000
EXPOSE 8000

ENV DIST /dist
ENV POSTS_DB /db/posts
ENV SESSIONS_DB /db/sessions
VOLUME /dist /db

ENV BLOG_BASE_URL http://localhost:8000

CMD [ "node", "server.js" ]
