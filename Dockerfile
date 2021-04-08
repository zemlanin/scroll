FROM node:14-slim
RUN npm set unsafe-perm true

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    rsync \
    gcc pkg-config libicu-dev icu-devtools libsqlite3-dev \
    # to install oembed-providers package from github
    git openssh-client \
  && rm -rf /var/lib/apt/lists/*

COPY scripts/ ./scripts/
COPY sqlite-icu/ ./sqlite-icu/
COPY package*.json ./

ENV NODE_ENV production
RUN npm ci
RUN apt-get remove -y \
    # clean up after compiling `sqlite-icu/libicu.so`
    gcc pkg-config \
    git openssh-client \
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
