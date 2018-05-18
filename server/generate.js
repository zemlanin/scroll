const _fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const fs = {
  mkdir: promisify(_fs.mkdir),
  access: promisify(_fs.access),
  readFile: promisify(_fs.readFile),
  writeFile: promisify(_fs.writeFile),
  exists: promisify(_fs.exists)
};
const { authed } = require("./auth.js");
const mustache = require("mustache");

const generate = require("../index.js");

async function loadTemplate(tmpl) {
  return (
    loadTemplate.cache[tmpl] ||
    (loadTemplate.cache[tmpl] = (await fs.readFile(tmpl)).toString())
  );
}
loadTemplate.cache = {};

async function render(tmpl, data) {
  return mustache.render(await loadTemplate(tmpl), data, {
    header: await loadTemplate(
      path.resolve(__dirname, "..", "templates", "header.mustache")
    ),
    footer: await loadTemplate(
      path.resolve(__dirname, "..", "templates", "footer.mustache")
    )
  });
}

module.exports = {
  get: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      return `<a href="/backstage">auth</a>`;
    }

    return render(path.resolve(__dirname, "templates", "generate.mustache"));
  },
  post: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
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
