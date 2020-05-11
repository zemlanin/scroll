#!/usr/bin/env node

const generate = require("./generate.js");
const server = require("./server.js");

if (!process.argv[2] || process.argv[2] === "generate") {
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;

  generate.start({ only });
} else if (process.argv[2] === "server") {
  server.start();
} else {
  console.log(
    "Usage: " + process.argv.slice(0, 2).join(" ") + " {server,generate}"
  );
}

process.on("unhandledRejection", (err) => {
  throw err;
});
