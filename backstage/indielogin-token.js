const { getSessionByOneTimeCode, signedSessionId } = require("./auth.js");

module.exports = {
  async get(req, res) {
    res.statusCode = 404;
  },
  async post(req, res) {
    const session = await getSessionByOneTimeCode(req.post.code);

    if (session && session.micropub.me === req.post.me) {
      const access_token = signedSessionId(session.id);

      res.setHeader("Content-Type", "application/json");
      return JSON.stringify({
        me: session.micropub.me,
        scope: session.micropub.scope,
        access_token: access_token,
        token_type: "Bearer",
      });
    }

    res.statusCode = 403;
    return "403";
  },
};
