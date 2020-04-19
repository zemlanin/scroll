const fs = require("fs");
const url = require("url");
const http = require("http");
const path = require("path");
const querystring = require("querystring");
const { promisify } = require("util");
const fsPromises = {
  readFile: promisify(fs.readFile)
};

const sqlite = require("sqlite");
const UrlPattern = require("url-pattern");

require("dotenv").config();

const { DIST, POSTS_DB, PORT, loadIcu } = require("./common.js");

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
    extensions: ["html"]
  });

  staticHandler = function(req, res) {
    return new Promise(resolve => {
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
    async (req, res) => res.writeHead(302, { Location: "/rss.xml" })
  ],
  ["GET", "/rss.xml", staticHandler],
  [
    "GET",
    /^\/post\/(\d+)/,
    async (req, res) =>
      res.writeHead(302, { Location: `/tumblr-zem-${req.params[0]}.html` })
  ],
  [
    "GET",
    "/robots.txt",
    async (req, res) => {
      res.setHeader("content-type", "text/plain");

      return await fsPromises.readFile(
        path.resolve(__dirname, "static", "robots.txt")
      );
    }
  ],
  [
    "GET",
    "/favicon.ico",
    async (req, res) => {
      res.setHeader("content-type", "image/vnd.microsoft.icon");

      return await fsPromises.readFile(
        path.resolve(__dirname, "static", "favicon.ico")
      );
    }
  ],
  [
    "GET",
    "/favicon.png",
    async (req, res) => {
      res.setHeader("content-type", "image/png");

      return await fsPromises.readFile(
        path.resolve(__dirname, "static", "favicon.png")
      );
    }
  ],
  [
    "GET",
    "/favicon.svg",
    async (req, res) => {
      res.setHeader("content-type", "image/svg+xml");

      return await fsPromises.readFile(
        path.resolve(__dirname, "static", "favicon.svg")
      );
    }
  ],
  [
    "GET",
    "/mask-icon.svg",
    async (req, res) => {
      res.setHeader("content-type", "image/svg+xml");

      return await fsPromises.readFile(
        path.resolve(__dirname, "static", "mask-icon.svg")
      );
    }
  ],
  [
    "GET",
    "/details-element-polyfill.js",
    async (req, res) => {
      res.setHeader("content-type", "application/javascript");

      return await fsPromises.readFile(
        path.resolve(__dirname, "static", "details-element-polyfill.js")
      );
    }
  ],
  ["GET", "/media/*", staticHandler],
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
  ["GET", "/:name(.html)", staticHandler]
].map(([m, p, h]) => [m, new UrlPattern(p), h]);

async function processPost(request, response) {
  var queryData = "";
  return new Promise((resolve, reject) => {
    request.on("data", function(data) {
      queryData += data;
      if (queryData.length > 1e6) {
        queryData = "";
        response.writeHead(413, { "Content-Type": "text/plain" }).end();
        request.connection.destroy();
        reject("413 Content Too Long");
      }
    });

    request.on("end", function() {
      request.post = querystring.parse(queryData);
      resolve(request.post);
    });
  });
}

const server = http.createServer((req, res) => {
  const pathname = url.parse(req.url).pathname.replace(/(.)\/$/, "$1");
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

    req.absolute = url.format({
      protocol,
      host,
      port
    });

    if (
      req.method === "POST" &&
      req.headers["content-type"] === "application/x-www-form-urlencoded"
    ) {
      const ogHandler = handler;
      handler = async () => {
        await processPost(req, res);
        return ogHandler(req, res);
      };
    }

    let db;
    req.db = async () => {
      return db || (db = await sqlite.open(POSTS_DB).then(loadIcu));
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
      .then(body => {
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
          contentType === "application/javascript" ||
          (contentType && contentType.startsWith("image/"))
        ) {
          res.writeHead(res.statusCode, {
            "Content-Type": contentType || "text/html"
          });
          res.end(body);
        } else if (body || contentType === "application/json") {
          res.writeHead(res.statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify(body));
        } else {
          res.end();
        }
      })
      .then(() => db && db.driver.open && db.close())
      .catch(err => {
        if (!res.finished) {
          console.error(err);

          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("500");
        }

        return db && db.driver.open && db.close();
      });
  }
});

function start() {
  sqlite
    .open(POSTS_DB)
    .then(db => loadIcu(db))
    .then(db =>
      db.migrate({ migrationsPath: path.resolve(__dirname, "migrations") })
    )
    .then(() => {
      server.on("clientError", (err, socket) => {
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      });

      server.listen(PORT);

      console.log(`running on ${PORT}`);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

if (require.main === module) {
  start();
} else {
  module.exports = {
    server,
    start
  };
}
