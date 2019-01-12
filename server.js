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
const static = require("node-static");
const UrlPattern = require("url-pattern");

require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const { DIST, POSTS_DB } = require("./common.js");

const fileServer = new static.Server(DIST, {
  cache: false,
  serverInfo: "scroll",
  gzip: /^text\//
});

function write404(req, res) {
  if (!res.finished) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404");
  }
}

function serveHtml(req, res) {
  return new Promise((resolve, reject) => {
    fileServer
      .serveFile((req.params.name || "index") + ".html", 200, {}, req, res)
      .on("success", resolve)
      .on("error", () => {
        write404(req, res);
        reject();
      });
  });
}

function serveMedia(req, res) {
  return new Promise((resolve, reject) => {
    fileServer
      .serve(req, res)
      .on("success", resolve)
      .on("error", () => {
        write404(req, res);
        reject();
      });
  });
}

function write403(req, res) {
  if (!res.finished) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403");
  }
}

const handlers = [
  ["GET", "/*.php", write403],
  ["GET", /^\/(cgi|cgi-bin|phpmyadmin|myadmin|pma|sql|mysql)/i, write403],
  ["GET", "/", serveHtml],
  [
    "GET",
    "/rss",
    async (req, res) => res.writeHead(302, { Location: "/rss.xml" })
  ],
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
  ["GET", "/media/*", serveMedia],
  ["GET", "/:name(.html)", serveHtml],
  ["GET", "/backstage", require("./backstage/backstage.js")],
  ["GET", "/backstage/callback", require("./backstage/callback.js")],
  ["GET", "/backstage/edit", require("./backstage/edit.js").get],
  ["POST", "/backstage/edit", require("./backstage/edit.js").post],
  ["POST", "/backstage/delete", require("./backstage/delete.js")],
  ["GET", "/backstage/preview", require("./backstage/preview.js")],
  ["POST", "/backstage/preview", require("./backstage/preview.js")],
  ["GET", "/backstage/generate", require("./backstage/generate.js").get],
  ["POST", "/backstage/generate", require("./backstage/generate.js").post],
  ["POST", "/backstage/jwt", require("./backstage/jwt.js")],
  ["GET", "/backstage/media", require("./backstage/media.js").get],
  ["POST", "/backstage/media", require("./backstage/media.js").post],
  ["POST", "/backstage/convert", require("./backstage/convert.js").post],
  ["GET", "/backstage/gauges.svg", require("./backstage/gauges-graph.js")]
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
    const port = (host.match(/:(\d+)$/) && host.match(/:(\d+)$/)[1]) || null;

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
      return db || (db = await sqlite.open(POSTS_DB));
    };

    const result = handler(req, res);

    return (result instanceof Promise ? result : Promise.resolve(result))
      .then(body => {
        if (res.finished) {
          return;
        }

        const contentType = res.getHeader("content-type");
        if (
          typeof body === "string" ||
          contentType === "text/plain" ||
          contentType === "text/html"
        ) {
          res.writeHead(res.statusCode, {
            "Content-Type": contentType || "text/html"
          });
          res.end(body);
        } else if (
          body ||
          res.getHeader("content-type") === "application/json"
        ) {
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

if (require.main === module) {
  sqlite
    .open(POSTS_DB)
    .then(db =>
      db
        .migrate({ migrationsPath: path.resolve(__dirname, "migrations") })
        .then(() => db.close())
    )
    .then(() => {
      server.on("clientError", (err, socket) => {
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      });

      server.listen(process.env.PORT);

      console.log(`running on ${process.env.PORT}`);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
} else {
  module.exports = {
    server
  };
}
