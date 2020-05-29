const url = require("url");
const https = require("https");
const cookie = require("cookie");
const querystring = require("querystring");
const { createSession } = require("./auth.js");

async function verifyAccessToken(access_token) {
  if (!access_token) {
    return null;
  }

  const githubUserResp = await new Promise((resolve) => {
    const req = https.request(
      {
        host: "api.github.com",
        path: "/user",
        method: "get",
        query: {
          access_token: access_token,
        },
        headers: {
          Accept: "application/json",
          Authorization: `token ${access_token}`,
          "User-Agent": "scroll-auth",
        },
      },
      (authRes) => {
        let result = "";

        authRes.on("data", function (chunk) {
          result += chunk;
        });
        authRes.on("end", function () {
          resolve(JSON.parse(result));
        });
        authRes.on("error", function (err) {
          resolve(err);
        });
      }
    );

    req.on("error", function (err) {
      resolve(err);
    });

    req.end();
  });

  if (
    githubUserResp &&
    githubUserResp.id &&
    githubUserResp.id.toString() === process.env.GITHUB_USER_ID
  ) {
    return githubUserResp;
  }

  return null;
}

module.exports = async (req, res) => {
  const query = url.parse(req.url, true).query;

  if (!query.code) {
    res.statusCode = 403;

    return `403`;
  }

  const postData = querystring.stringify({
    code: query.code,
    client_id: process.env.GITHUB_APP_ID,
    client_secret: process.env.GITHUB_APP_SECRET,
  });

  const verification = await new Promise((resolve) => {
    const req = https.request(
      {
        host: "github.com",
        path: "/login/oauth/access_token",
        method: "post",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": postData.length,
          Accept: "application/json",
        },
      },
      (authRes) => {
        let result = "";

        authRes.on("data", function (chunk) {
          result += chunk;
        });
        authRes.on("end", function () {
          resolve(JSON.parse(result));
        });
        authRes.on("error", function (err) {
          resolve(err);
        });
      }
    );

    req.on("error", function (err) {
      resolve(err);
    });

    req.write(postData);
    req.end();
  });

  const githubUser = await verifyAccessToken(verification.access_token);

  if (githubUser) {
    const signedSession = await createSession({ githubUser: githubUser.login });

    res.statusCode = 303;

    res.setHeader(
      "Set-Cookie",
      cookie.serialize("session", signedSession, {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      })
    );

    res.setHeader(
      "Location",
      query.next && query.next.startsWith("/backstage")
        ? decodeURIComponent(query.next)
        : "/backstage"
    );
    return;
  }

  return "fail";
};
