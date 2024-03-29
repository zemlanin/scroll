const fs = require("fs");
const { format: urlFormat } = require("url");
const http = require("http");
const path = require("path");
const querystring = require("querystring");
const { promisify } = require("util");
const fsPromises = {
  readFile: promisify(fs.readFile),
};

const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");
const UrlPattern = require("url-pattern");

require("dotenv").config();

const {
  DIST,
  POSTS_DB,
  SESSIONS_DB,
  ACTIVITYSTREAMS_DB,
  PORT,
  loadIcu,
} = require("./common.js");

function write404(req, res) {
  if (!res.finished) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404");
  }
}

function write403(req, res) {
  if (!res.finished) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403");
  }
}

function writeStaticViaServer(req, res) {
  if (!res.finished) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(
      "500: in `production` env, static should be served via separate server (for example, nginx)"
    );
  }
}

let staticHandler = writeStaticViaServer;

if (process.env.NODE_ENV !== "production") {
  const serveStatic = require("serve-static");
  const staticMiddleware = serveStatic(path.resolve(DIST), {
    index: ["index.html"],
    extensions: ["html"],
    setHeaders(res, filepath, _stat) {
      if (
        filepath.endsWith(".json") &&
        filepath.startsWith(path.resolve(DIST, "actor"))
      ) {
        res.setHeader("content-type", "application/activity+json");
      }
    },
  });

  staticHandler = function (req, res) {
    if (req.url.startsWith("/actor/") && !req.url.endsWith(".json")) {
      req.url = req.url.replace(/\/?$/, ".json");
    }

    if (req.url === "/.well-known/host-meta") {
      res.setHeader("Location", "/.well-known/host-meta.xml");
      res.writeHead(301);
      return;
    }

    return new Promise((resolve) => {
      return staticMiddleware(req, res, () => {
        res.writeHead(404);
        resolve("404");
      });
    });
  };
}

const handlers = [
  ["GET", "/*.php", write403],
  ["GET", /^\/(cgi|cgi-bin|phpmyadmin|myadmin|pma|sql|mysql)/i, write403],
  ["GET", "/", staticHandler],
  [
    "GET",
    "/rss",
    async (req, res) => res.writeHead(302, { Location: "/rss.xml" }),
  ],
  ["GET", "/rss.xml", staticHandler],
  [
    "GET",
    /^\/post\/(\d+)/,
    async (req, res) =>
      res.writeHead(302, { Location: `/tumblr-zem-${req.params[0]}.html` }),
  ],
  [
    "GET",
    "/search",
    async (req, res) => {
      const { hostname, searchParams } = new URL(req.url, req.absolute);

      const q = searchParams.get("q") || "";
      const location = new URL(
        "?" +
          new URLSearchParams({
            q: `${q} site:${hostname}`,
          }).toString(),
        "https://duckduckgo.com"
      ).toString();

      res.writeHead(302, { Location: location });
    },
  ],
  [
    "GET",
    "/robots.txt",
    async (req, res) => {
      res.setHeader("content-type", "text/plain");

      return await fsPromises.readFile(
        path.resolve(__dirname, "static", "robots.txt")
      );
    },
  ],
  [
    "GET",
    "/favicon.ico",
    async (req, res) => {
      res.setHeader("content-type", "image/vnd.microsoft.icon");

      return await fsPromises.readFile(
        path.resolve(__dirname, "static", "favicon.ico")
      );
    },
  ],
  [
    "GET",
    "/favicon.png",
    async (req, res) => {
      res.setHeader("content-type", "image/png");

      return await fsPromises.readFile(
        path.resolve(__dirname, "static", "favicon.png")
      );
    },
  ],
  [
    "GET",
    "/favicon.svg",
    async (req, res) => {
      res.setHeader("content-type", "image/svg+xml");

      return await fsPromises.readFile(
        path.resolve(__dirname, "static", "favicon.svg")
      );
    },
  ],
  [
    "GET",
    "/mask-icon.svg",
    async (req, res) => {
      res.setHeader("content-type", "image/svg+xml");

      return await fsPromises.readFile(
        path.resolve(__dirname, "static", "mask-icon.svg")
      );
    },
  ],
  [
    "GET",
    "/details-element-polyfill.js",
    async (req, res) => {
      res.setHeader("content-type", "application/javascript");

      return await fsPromises.readFile(
        path.resolve(__dirname, "static", "details-element-polyfill.js")
      );
    },
  ],
  [
    "GET",
    "/pdfobject.min.js",
    async (req, res) => {
      res.setHeader("content-type", "application/javascript");

      return await fsPromises.readFile(
        path.resolve(__dirname, "static", "pdfobject.min.js")
      );
    },
  ],
  [
    "GET",
    "/hls.min.js",
    async (req, res) => {
      res.setHeader("content-type", "application/javascript");

      return await fsPromises.readFile(
        path.resolve(__dirname, "static", "hls.min.js")
      );
    },
  ],
  ["GET", "/media/*", staticHandler],
  ["GET", "/feeds/*", staticHandler],
  ["GET", "/backstage", require("./backstage/index.js")],
  ["GET", "/backstage/callback", require("./backstage/callback.js")],
  ["GET", "/backstage/edit", require("./backstage/edit.js").get],
  ["POST", "/backstage/edit", require("./backstage/edit.js").post],
  ["POST", "/backstage/delete", require("./backstage/delete.js")],
  ["GET", "/backstage/preview", require("./backstage/preview.js")],
  ["POST", "/backstage/preview", require("./backstage/preview.js")],
  ["GET", "/backstage/generate", require("./backstage/generate.js").get],
  ["POST", "/backstage/generate", require("./backstage/generate.js").post],
  ["GET", "/backstage/media", require("./backstage/media.js").get],
  ["POST", "/backstage/media", require("./backstage/media.js").post],
  ["POST", "/backstage/convert", require("./backstage/convert.js").post],
  ["GET", "/backstage/goaccess.svg", require("./backstage/goaccess-graph.js")],
  ["GET", "/backstage/embeds", require("./backstage/embeds.js").get],
  ["POST", "/backstage/embeds", require("./backstage/embeds.js").post],
  [
    "GET",
    "/backstage/notifications",
    require("./backstage/notifications.js").index,
  ],
  [
    "GET",
    "/.well-known/webfinger",
    async (req, res) => {
      const resource =
        new URL(req.url, req.absolute).searchParams.get("resource") || "";

      if (
        !resource ||
        !resource.match(/^acct:[a-z0-9-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/)
      ) {
        res.writeHead(404);
        return;
      }

      res.setHeader("content-type", "application/jrd+json; charset=utf-8");

      try {
        return (
          await fsPromises.readFile(
            path.resolve(DIST, ".well-known", "webfinger", resource + ".json")
          )
        ).toString();
      } catch (e) {
        res.writeHead(404);
      }
    },
  ],
  ["GET", "/.well-known/*", staticHandler],
  ["GET", "/actor/*", staticHandler],
  ["POST", "/activitystreams/inbox", require("./activitystreams/inbox.js")],
  ["POST", "/actor/:name/inbox", require("./activitystreams/inbox.js")],
  [
    "POST",
    "/activitystreams/:name/inbox",
    require("./activitystreams/inbox.js"),
  ],
  ["GET", "/:name(.html)", staticHandler],
].map(([m, p, h]) => [m, new UrlPattern(p), h]);

async function processPost(request, response, contentType) {
  var queryData = "";
  return new Promise((resolve, reject) => {
    request.on("data", function (data) {
      queryData += data;
      if (queryData.length > 1e6) {
        queryData = "";
        response.writeHead(413, { "Content-Type": "text/plain" }).end();
        request.connection.destroy();
        reject("413 Content Too Long");
      }
    });

    request.on("end", function () {
      try {
        request.post =
          contentType === "application/x-www-form-urlencoded"
            ? querystring.parse(queryData)
            : JSON.parse(queryData);
        resolve(request.post);
      } catch (e) {
        reject(new BadRequestError());
      }
    });
  });
}

const server = http.createServer((req, res) => {
  const pathname = req.url.replace(/\?.+$/, "").replace(/(.)\/$/, "$1");

  let [, , handler] =
    handlers.find(([method, pattern]) => {
      if (req.method == method || (method == "GET" && req.method == "HEAD")) {
        req.params = pattern.match(pathname);
      }

      return !!req.params;
    }) || [];

  if (!handler) {
    return write404(req, res);
  } else {
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.headers["host"];
    const port =
      (host && host.match(/:(\d+)$/) && host.match(/:(\d+)$/)[1]) || null;

    req.absolute = urlFormat({
      protocol,
      host,
      port,
    });

    if (
      req.method === "POST" &&
      (req.headers["content-type"] === "application/x-www-form-urlencoded" ||
        req.headers["content-type"] === "application/json" ||
        req.headers["content-type"] === "application/activity+json")
    ) {
      const ogHandler = handler;
      handler = async () => {
        await processPost(req, res, req.headers["content-type"]);
        return ogHandler(req, res);
      };
    }

    let db;
    req.db = async () => {
      if (!db) {
        db = await sqlite
          .open({ filename: POSTS_DB, driver: sqlite3.Database })
          .then(loadIcu);

        res.on("finish", () => db.close());
      }

      return db;
    };

    let asdb;
    req.asdb = async () => {
      if (!asdb) {
        asdb = await sqlite
          .open({ filename: ACTIVITYSTREAMS_DB, driver: sqlite3.Database })
          .then(loadIcu);

        res.on("finish", () => asdb.close());
      }

      return asdb;
    };

    let result;
    let resultPromise;

    try {
      result = handler(req, res);
      resultPromise =
        result instanceof Promise ? result : Promise.resolve(result);
    } catch (e) {
      resultPromise = Promise.reject(e);
    }

    return resultPromise
      .then((body) => {
        if (res.finished) {
          return;
        }

        const contentType = res.getHeader("content-type");
        if (
          typeof body === "string" ||
          contentType === "text/xml" ||
          contentType === "text/html" ||
          contentType === "text/plain" ||
          contentType === "text/markdown" ||
          contentType === "application/json" ||
          contentType === "application/javascript" ||
          contentType === "application/x-www-form-urlencoded" ||
          (contentType && contentType.startsWith("image/"))
        ) {
          res.writeHead(res.statusCode, {
            "Content-Type": contentType || "text/html",
          });
          res.end(body);
        } else if (body) {
          res.writeHead(res.statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify(body));
        } else {
          res.end();
        }
      })
      .catch((err) => {
        if (!res.finished) {
          if (err instanceof BadRequestError) {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("400");
            return;
          }

          console.error(err);

          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("500");
        }
      });
  }
});

function start() {
  Promise.resolve()
    .then(async () => {
      const db = await sqlite.open({
        filename: POSTS_DB,
        driver: sqlite3.Database,
      });
      await loadIcu(db);
      await db.migrate({
        migrationsPath: path.resolve(__dirname, "migrations/posts"),
      });
    })
    .then(async () => {
      const sessionsDb = await sqlite.open({
        filename: SESSIONS_DB,
        driver: sqlite3.Database,
      });

      await sessionsDb.migrate({
        migrationsPath: path.resolve(__dirname, "migrations/sessions"),
      });
    })
    .then(async () => {
      const sessionsDb = await sqlite.open({
        filename: ACTIVITYSTREAMS_DB,
        driver: sqlite3.Database,
      });

      await sessionsDb.migrate({
        migrationsPath: path.resolve(__dirname, "migrations/activitystreams"),
      });
    })
    .then(() => {
      server.on("clientError", (err, socket) => {
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      });

      server.listen(PORT);

      console.log(`running on ${PORT}`);
    })
    .then(() => {
      return require("./linkblog.js").watch();
    })
    .then(() => {
      return require("./activitystreams/outbox.js").watch();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

class BadRequestError extends Error {}

if (require.main === module) {
  start();
} else {
  module.exports = {
    server,
    start,
  };
}
