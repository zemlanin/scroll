const crypto = require("crypto");

const jwt = require("jsonwebtoken");

const { verifyAccessToken } = require("./auth.js");

const INDIELOGIN_SECRET = (() => {
  return (
    process.env.INDIELOGIN_SECRET || crypto.randomBytes(256).toString("hex")
  );
})();

function generateCode(payload) {
  const { me, github, client_id, scope } = payload;

  return jwt.sign({ me, github, client_id, scope }, INDIELOGIN_SECRET, {});
}

function verifyCode(code) {
  try {
    const verified = jwt.verify(code, INDIELOGIN_SECRET);

    if (verified && verifyAccessToken(verified.github)) {
      return verified;
    }

    return null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  generateCode,
  verifyCode,
  async get(req, res) {
    res.statusCode = 404;
  },
  async post(req, res) {
    const { me, code } = req.post;
    const codePayload = await verifyCode(code);

    if (codePayload) {
      res.setHeader("Content-Type", "application/json");
      return JSON.stringify({
        me,
        scope: codePayload.scope,
        access_token: code,
        token_type: "Bearer",
      });
    }

    res.statusCode = 403;
    return "403";
  },
};
