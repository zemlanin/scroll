const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const fsPromises = {
  readFile: promisify(fs.readFile)
};

const mustache = require("mustache");
const UglifyJS = require("uglify-js");

const fontAwesomeSVGReducer = (acc, icon) =>
  icon.icon ? { ...acc, [icon.iconName]: icon.icon[4] } : acc;

const fas = Object.values(
  require("@fortawesome/fontawesome-free-solid")
).reduce(fontAwesomeSVGReducer, {});
const fab = Object.values(
  require("@fortawesome/fontawesome-free-brands")
).reduce(fontAwesomeSVGReducer, {});

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

async function render(tmpl, data) {
  return mustache.render(
    await loadTemplate(path.resolve(__dirname, tmpl)),
    {
      fas,
      fab,
      ...data
    },
    {
      "bulma.css": await loadTemplate(require.resolve("bulma/css/bulma.css")),
      "media-bar.js": await loadTemplate(
        path.resolve(__dirname, "media-bar.js"),
        code => {
          let c = UglifyJS.minify(code).code;
          if (!c) {
            throw new Error("Empty media-bar.js");
          }
          return c;
        }
      )
    }
  );
}

module.exports = {
  render
};
