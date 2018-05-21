const { authed } = require("./auth.js");

const generate = require("../index.js");
const { render } = require("./templates/index.js");

module.exports = {
  get: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      res.statusCode = 401;
      return `<a href="/backstage">auth</a>`;
    }

    return render("generate.mustache");
  },
  post: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      res.statusCode = 401;
      return `<a href="/backstage">auth</a>`;
    }

    res.writeHead(200, { "Content-Type": "text/plain" });

    return generate(res, res)
      .then(() => {
        res.end("done");
      })
      .catch(e => {
        res.write(e.toString());
        res.end("fail");
      });
  }
};
