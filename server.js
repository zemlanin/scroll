const http = require("http");
const url = require("url");

const handlers = {
  "GET /backstage": require("./server/backstage.js"),
  "GET /backstage/callback": require("./server/callback.js")
};

const server = http.createServer((req, res) => {
  const handler = handlers[`${req.method} ${url.parse(req.url).pathname.replace(/\/$/, '')}`];

  if (!handler) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404");
  } else {
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.headers["host"];
    const port = (host.match(/:(\d+)$/) && host.match(/:(\d+)$/)[1]) || null;

    req.absolute = url.format(
      Object.assign({
        protocol,
        host,
        port
      })
    );

    handler(req, res)
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
      .catch(err => {
        console.error(err);

        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("500");
      });
  }
});

server.on("clientError", (err, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(process.env.PORT);

console.log(`running on ${process.env.PORT}`);
