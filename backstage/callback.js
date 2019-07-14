const url = require("url");
const https = require("https");
const querystring = require("querystring");
const { auth } = require("./auth.js");

module.exports = async (req, res) => {
  const query = url.parse(req.url, true).query;

  if (!query.code) {
    res.statusCode = 403;

    return `403`;
  }

  const postData = querystring.stringify({
    code: query.code,
    client_id: process.env.GITHUB_APP_ID,
    client_secret: process.env.GITHUB_APP_SECRET
  });

  const verification = await new Promise(resolve => {
    const req = https.request(
      {
        host: "github.com",
        path: "/login/oauth/access_token",
        method: "post",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": postData.length,
          Accept: "application/json"
        }
      },
      authRes => {
        let result = "";

        authRes.on("data", function(chunk) {
          result += chunk;
        });
        authRes.on("end", function() {
          resolve(JSON.parse(result));
        });
        authRes.on("error", function(err) {
          resolve(err);
        });
      }
    );

    req.on("error", function(err) {
      resolve(err);
    });

    req.write(postData);
    req.end();
  });

  if (verification.access_token) {
    const authed_user = await new Promise(resolve => {
      const req = https.request(
        {
          host: "api.github.com",
          path: "/user",
          method: "get",
          query: {
            access_token: verification.access_token
          },
          headers: {
            Accept: "application/json",
            Authorization: `token ${verification.access_token}`,
            "User-Agent": "scroll-auth"
          }
        },
        authRes => {
          let result = "";

          authRes.on("data", function(chunk) {
            result += chunk;
          });
          authRes.on("end", function() {
            resolve(JSON.parse(result));
          });
          authRes.on("error", function(err) {
            resolve(err);
          });
        }
      );

      req.on("error", function(err) {
        resolve(err);
      });

      req.end();
    });

    if (
      authed_user &&
      authed_user.id &&
      authed_user.id.toString() === process.env.GITHUB_USER_ID
    ) {
      auth({ me: authed_user.login, github: verification.access_token }, res);

      res.statusCode = 303;
      res.setHeader(
        "Location",
        query.next && query.next.startsWith("/backstage")
          ? decodeURIComponent(query.next)
          : "/backstage"
      );
      return;
    }

    return "fail";
  } else {
    return "fail";
  }

  // if (verification.me === query.me) {
  //   auth({ me: verification.me }, res);

  //   return `ok: ${verification.me} <a href="${url.resolve(
  //     req.absolute,
  //     "/backstage"
  //   )}">backstage</a>`;
  // } else {
  //   console.log(verification);

  //   return "fail";
  // }
};
