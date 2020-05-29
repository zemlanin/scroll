const url = require("url");
const { getSession, createSession, sendToAuthProvider } = require("./auth.js");

module.exports = {
  async get(req, res) {
    const session = await getSession(req, res);
    if (!session) {
      return sendToAuthProvider(req, res);
    }

    const query = url.parse(req.url, true).query;

    const tokenSession = await createSession({
      githubUser: session.githubUser,
      micropub: {
        me: query.me,
        scope: query.scope,
      },
    });
    return `
      <form method="get" action="${encodeURI(query.redirect_uri)}">
        <input type="hidden" name="state" value="${encodeURI(query.state)}">
        <input type="hidden" name="code" value="${tokenSession}">
        <button>authorize ${encodeURI(query.client_id)}</button>
      </form>
    `;
  },
  async post(req, res) {
    res.statusCode = 404;
  },
};
