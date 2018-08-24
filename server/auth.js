const cookie = require("cookie");
const url = require("url");
const jwt = require("jsonwebtoken");
const secrets = require("./secrets.json");

const SECRET = (() => {
  return (
    secrets.jwt ||
    require("crypto")
      .randomBytes(256)
      .toString("hex")
  );
})();

module.exports = {
  authed(req, res) {
    const jwtCookie =
      cookie.parse(req.headers.cookie || "").jwt ||
      (req.headers.authorization &&
        req.headers.authorization.match(
          /^Bearer [a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/
        ) &&
        req.headers.authorization.slice(7));

    if (!jwtCookie) {
      return null;
    }

    try {
      const verified = jwt.verify(jwtCookie, SECRET);

      if (verified && verified.exp && verified.exp * 1000 < +new Date()) {
        module.exports.auth(verified, res);
      }

      return verified;
    } catch (e) {
      module.exports.logout(res);
      return null;
    }
  },

  sendToAuthProvider(req, res) {
    const githubAuthUrl = url.format({
      protocol: "https",
      hostname: "github.com",
      pathname: "/login/oauth/authorize",
      query: {
        scope: "user:email",
        client_id: secrets.githubId
      }
    });

    res.statusCode = 303;
    res.setHeader("Location", githubAuthUrl);
  },

  generateToken(payload, expiresIn = 60 * 60 * 24 * 7) {
    return jwt.sign(
      {
        me: payload.me,
        github: payload.github
      },
      SECRET,
      { expiresIn }
    );
  },

  auth(payload, res) {
    const jwtToken = module.exports.generateToken(payload);

    res.setHeader(
      "Set-Cookie",
      cookie.serialize("jwt", jwtToken, {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 7,
        path: "/"
      })
    );
  },

  logout(res) {
    res.setHeader(
      "Set-Cookie",
      cookie.serialize("jwt", "", { maxAge: 0, path: "/" })
    );
  }
};
