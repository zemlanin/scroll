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

    res.writeHead(200, {
      "Content-Type": "text/html",
      "Cache-Control": "no-cache"
    });

    res.write(
      `
        <body style="position: absolute; bottom: 0">
          <script>
            document.addEventListener("DOMContentLoaded", function() {
              document.body.style.position = "";
              document.body.scrollTop = document.body.scrollHeight;
            })
          </script>
          <pre style="word-wrap: break-word; white-space: pre-wrap;">
      `
    );

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
