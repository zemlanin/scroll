const url = require("url");
const crypto = require("crypto");

const cookie = require("cookie");
const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");

const { SESSIONS_DB } = require("../common.js");

const JWT_SECRET = (() => {
  return (
    process.env.JWT_SECRET || require("crypto").randomBytes(256).toString("hex")
  );
})();

function signedSessionId(id) {
  const hmac = crypto.createHmac("sha256", JWT_SECRET);
  hmac.update(id);
  const digest = hmac.digest("hex");
  return `${id}.${digest}`;
}

function verifySessionId(signedId) {
  if (!signedId) {
    return null;
  }

  const [id, signature] = signedId.split(".");

  const hmac = crypto.createHmac("sha256", JWT_SECRET);
  hmac.update(id);
  const digest = hmac.digest("hex");

  if (signature === digest) {
    return id;
  }

  return null;
}

module.exports = {
  async createSession(data) {
    const sessionsDb = await sqlite.open({
      filename: SESSIONS_DB,
      driver: sqlite3.Database,
    });
    const sessionId = require("crypto").randomBytes(48).toString("hex");

    await sessionsDb.run(`INSERT INTO sessions (id, data) VALUES (?1, ?2)`, {
      1: sessionId,
      2: JSON.stringify(data || {}),
    });

    await sessionsDb.close();

    return signedSessionId(sessionId);
  },
  async getSession(req, res) {
    const sessionCookie = cookie.parse(req.headers.cookie || "").session;

    const bearerToken =
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ") &&
      req.headers.authorization.slice(7);

    if (!sessionCookie && !bearerToken) {
      return null;
    }

    const signedSession = sessionCookie || bearerToken;

    const sessionId = verifySessionId(signedSession);

    if (!sessionId) {
      return null;
    }

    const sessionsDb = await sqlite.open({
      filename: SESSIONS_DB,
      driver: sqlite3.Database,
    });
    res.on("finish", () => {
      sessionsDb.close();
    });
    const sessionRow = await sessionsDb.get(
      "SELECT * from sessions WHERE id = ?1",
      { 1: sessionId }
    );

    if (!sessionRow) {
      module.exports.logout(req, res);
      return null;
    }

    await sessionsDb.run(
      "UPDATE sessions SET last_access = CURRENT_TIMESTAMP WHERE id = ?1",
      { 1: sessionId }
    );

    return Object.freeze({
      ...JSON.parse(sessionRow.data || "{}"),
      id: sessionRow.id,
      async clear() {
        await sessionsDb.run(
          `UPDATE sessions SET data = json_object() WHERE id = ?1`,
          { 1: sessionId }
        );
      },
      async patch(obj) {
        await sessionsDb.run(
          `UPDATE sessions SET data = json_patch(data, ?2) WHERE id = ?1`,
          { 1: sessionId, 2: JSON.stringify(obj) }
        );
      },
    });
  },

  sendToAuthProvider(req, res) {
    const parsedUrl = url.parse(req.absolute);

    const redirectURL = url.format({
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      pathname: "/backstage/callback",
      query: {
        next: req.url,
      },
    });

    const githubAuthUrl = url.format({
      protocol: "https",
      hostname: "github.com",
      pathname: "/login/oauth/authorize",
      query: {
        scope: "user:email",
        client_id: process.env.GITHUB_APP_ID,
        redirect_uri: redirectURL,
      },
    });

    res.statusCode = 303;
    res.setHeader("Location", githubAuthUrl);
  },

  logout(req, res) {
    if (req.headers.cookie) {
      res.setHeader(
        "Set-Cookie",
        cookie.serialize("session", "", { maxAge: 0, path: "/" })
      );
    }
  },
};
