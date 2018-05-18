const url = require("url");
const path = require("path");

const { authed, generateToken } = require("./auth.js");
const sqlite = require("sqlite");

module.exports = async (req, res) => {
  const user = authed(req, res);

  if (!user) {
    return `<a href="/backstage">auth</a>`;
  }
  
  res.setHeader("Content-Type", "text/plain")

  return generateToken(user, 60 * 60 * 24 * 120);
};
