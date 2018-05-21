const mustache = require("mustache");
const path = require("path");
const _fs = require("fs");
const { promisify } = require("util");

const fs = {
  readFile: promisify(_fs.readFile)
};

async function loadTemplate(tmpl) {
  if (process.env.NODE_ENV === "development") {
    return (await fs.readFile(tmpl)).toString()
  }

  return (
    loadTemplate.cache[tmpl] ||
    (loadTemplate.cache[tmpl] = (await fs.readFile(tmpl)).toString())
  );
}
loadTemplate.cache = {};

async function render(tmpl, data) {
  return mustache.render(await loadTemplate(path.resolve(__dirname, tmpl)), data, {
    'bulma.css': await loadTemplate(
      require.resolve("bulma/css/bulma.css")
    )
  });
}

module.exports = {
    render
}
