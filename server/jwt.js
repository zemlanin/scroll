const { authed, generateToken, sendToAuthProvider } = require("./auth.js");

module.exports = async (req, res) => {
  const user = authed(req, res);

  if (!user) {
    return sendToAuthProvider(req, res);
  }

  res.setHeader("Content-Type", "text/plain");

  return generateToken(user, 60 * 60 * 24 * 120);
};
