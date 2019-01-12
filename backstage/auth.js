const cookie = require("cookie");
const url = require("url");
const jwt = require("jsonwebtoken");

const SECRET = (() => {
  return (
    process.env.JWT_SECRET ||
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
    const parsedUrl = url.parse(req.absolute);

    const redirectURL = url.format({
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      pathname: "/backstage/callback",
      query: {
        next: req.url
      }
    });

    const githubAuthUrl = url.format({
      protocol: "https",
      hostname: "github.com",
      pathname: "/login/oauth/authorize",
      query: {
        scope: "user:email",
        client_id: process.env.GITHUB_APP_ID,
        redirect_uri: redirectURL
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
