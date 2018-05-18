const cookie = require("cookie");
const jwt = require("jsonwebtoken");

const SECRET = (() => {
  try {
    return require("./secrets.json").jwt;
  } catch (e) {
    return require("crypto")
      .randomBytes(256)
      .toString("hex");
  }
})();

module.exports = {
  authed(req, res) {
    const jwtCookie = cookie.parse(req.headers.cookie || "").jwt || req.headers.authorization && req.headers.authorization.match(/^Bearer [a-zA-Z0-9]+\.[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/) && req.headers.authorization.slice(7);

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
  
  generateToken(payload, expiresIn = 60 * 60 * 24 * 7) {
    return jwt.sign(
      {
        me: payload.me
      },
      SECRET,
      { expiresIn }
    );
  },

  auth(payload, res) {
    const jwtToken = generateToken(payload);

    res.setHeader(
      "Set-Cookie",
      cookie.serialize("jwt", jwtToken, {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 7
      })
    );
  },

  logout(res) {
    res.setHeader("Set-Cookie", cookie.serialize("jwt", "", { maxAge: 0 }));
  }
};
