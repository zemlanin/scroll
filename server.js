const http = require("http");
const url = require("url");
const querystring = require("querystring");
const sqlite = require("sqlite");

require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });

const { POSTS_DB } = require("./common.js");

const handlers = {
  "GET /backstage": require("./server/backstage.js"),
  "GET /backstage/callback": require("./server/callback.js"),
  "GET /backstage/edit": require("./server/edit.js").get,
  "POST /backstage/edit": require("./server/edit.js").post,
  "POST /backstage/delete": require("./server/delete.js"),
  "GET /backstage/preview": require("./server/preview.js"),
  "POST /backstage/preview": require("./server/preview.js"),
  "GET /backstage/generate": require("./server/generate.js").get,
  "POST /backstage/generate": require("./server/generate.js").post,
  "POST /backstage/jwt": require("./server/jwt.js"),
  "GET /backstage/media": require("./server/media.js").get,
  "POST /backstage/media": require("./server/media.js").post,
  "GET /backstage/gauges.svg": require("./server/gauges-graph.js")
};

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
  let handler =
    handlers[`${req.method} ${url.parse(req.url).pathname.replace(/\/$/, "")}`];

  if (!handler) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404");
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

    return handler(req, res)
      .then(body => {
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

server.on("clientError", (err, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(process.env.PORT);

console.log(`running on ${process.env.PORT}`);
