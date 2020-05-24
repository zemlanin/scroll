const url = require("url");
const { authed, sendToAuthProvider } = require("./auth.js");
const indieloginToken = require("./indielogin-token.js");

module.exports = {
  async get(req, res) {
    const user = authed(req, res);

    if (!user) {
      return sendToAuthProvider(req, res);
    }

    const query = url.parse(req.url, true).query;

    const code = indieloginToken.generateCode({
      me: query.me,
      github: user.github,
      client_id: query.client_id,
      scope: query.scope,
    });
    return `
      <form method="get" action="${encodeURI(query.redirect_uri)}">
        <input type="hidden" name="state" value="${encodeURI(query.state)}">
        <input type="hidden" name="code" value="${code}">
        <button>authorize ${encodeURI(query.client_id)}</button>
      </form>
    `;
  },
  async post(req, res) {
    res.statusCode = 404;
  },
};
