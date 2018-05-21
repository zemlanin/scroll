const { authed, generateToken } = require("./auth.js");

module.exports = async (req, res) => {
  const user = authed(req, res);

  if (!user) {
    res.statusCode = 401;
    return `<a href="/backstage">auth</a>`;
  }

  res.setHeader("Content-Type", "text/plain");

  return generateToken(user, 60 * 60 * 24 * 120);
};
