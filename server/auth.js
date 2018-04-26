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
    const jwtCookie = cookie.parse(req.headers.cookie || "").jwt;

    if (!jwtCookie) {
      return null;
    }

    try {
      return jwt.verify(jwtCookie, SECRET);
    } catch (e) {
      module.exports.logout(res);
      return null;
    }
  },

  auth(payload, res) {
    const jwtToken = jwt.sign(payload, SECRET, { expiresIn: 60 * 60 * 24 * 7 });

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
