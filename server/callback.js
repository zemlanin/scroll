const url = require("url");
const https = require("https");
const querystring = require("querystring");
const { auth } = require("./auth.js");

module.exports = async (req, res) => {
  const query = url.parse(req.url, true).query;

  if (!query.code || !query.me) {
    res.statusCode = 403;

    return `403`;
  }

  const postData = querystring.stringify({
    code: query.code,
    client_id: url.resolve(req.absolute, "/backstage/"),
    redirect_uri: url.resolve(req.absolute, "/backstage/callback")
  });

  const verification = await new Promise(resolve => {
    const req = https.request(
      {
        host: "indieauth.com",
        path: "/auth",
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

  if (verification.me === query.me) {
    auth({ me: verification.me }, res);

    return `ok: ${verification.me} <a href="${url.resolve(
      req.absolute,
      "/backstage"
    )}">backstage</a>`;
  } else {
    console.log(verification);

    return "fail";
  }
};
