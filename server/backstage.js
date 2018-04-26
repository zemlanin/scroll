const url = require("url");
const { authed, logout } = require("./auth.js");

module.exports = async (req, res) => {
  const indieAuthUrl = url.format({
    protocol: "https",
    hostname: "indieauth.com",
    pathname: "/auth",
    query: {
      me: "zemlan.in",
      client_id: url.resolve(req.absolute, "/backstage"),
      redirect_uri: url.resolve(req.absolute, "/backstage/callback")
    }
  });

  if (url.parse(req.url, true).query.logout) {
    logout(res);

    return `<a href="${indieAuthUrl}">auth</a>`;
  }

  const user = authed(req, res);

  if (!user) {
    return `<a href="${indieAuthUrl}">auth</a>`;
  }

  return `hello ${user.me} <a href="${url.resolve(
    req.absolute,
    "/backstage/?logout=1"
  )}">logout</a>`;
};
