const generate = require("./generate.js");
const server = require("./server.js");

if (!process.argv[2] || process.argv[2] === "generate") {
  generate.start();
} else if (process.argv[2] === "server") {
  server.start();
} else {
  console.log(
    "Usage: " + process.argv.slice(0, 2).join(" ") + " {server,generate}"
  );
}
