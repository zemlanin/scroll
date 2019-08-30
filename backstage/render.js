const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const fsPromises = {
  readFile: promisify(fs.readFile)
};

const mustache = require("mustache");

const { fas, far, fab } = require("../font-awesome-mustache.js");

async function loadTemplate(tmpl) {
  if (process.env.NODE_ENV === "development") {
    return (await fsPromises.readFile(tmpl)).toString();
  }

  return (
    loadTemplate.cache[tmpl] ||
    (loadTemplate.cache[tmpl] = (await fsPromises.readFile(tmpl)).toString())
  );
}
loadTemplate.cache = {};

const BACKSTAGE_TEMPLATES = path.resolve(__dirname, "templates");

async function backstageRender(tmpl, data) {
  return mustache.render(
    await loadTemplate(path.join(BACKSTAGE_TEMPLATES, tmpl)),
    {
      fas,
      far,
      fab,
      ...data
    },
    {
      "bulma.css": await loadTemplate(require.resolve("bulma/css/bulma.css")),
      "media-bar.js": await loadTemplate(
        path.join(BACKSTAGE_TEMPLATES, "media-bar.js")
      ),
      "media-bar.mustache": await loadTemplate(
        path.join(BACKSTAGE_TEMPLATES, "media-bar.mustache")
      )
    }
  );
}

module.exports = {
  backstageRender,
  render: backstageRender,
  backstage: backstageRender
};
