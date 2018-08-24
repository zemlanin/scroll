const { authed, sendToAuthProvider } = require("./auth.js");

const generate = require("../index.js");
const { render } = require("./templates/index.js");

module.exports = {
  get: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      return sendToAuthProvider(req, res);
    }

    return render("generate.mustache");
  },
  post: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      return sendToAuthProvider(req, res);
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
