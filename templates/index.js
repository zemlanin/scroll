const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const mustache = require("mustache");
const UglifyJS = require("uglify-js");
const CleanCSS = require("clean-css");

const fsPromises = {
  readFile: promisify(fs.readFile)
};

const { fas, far, fab } = require("../font-awesome-mustache.js");

async function loadTemplate(tmpl, processCallback) {
  if (loadTemplate.cache[tmpl]) {
    return loadTemplate.cache[tmpl];
  }

  if (processCallback) {
    return (loadTemplate.cache[tmpl] = processCallback(
      (await fsPromises.readFile(tmpl)).toString()
    ));
  }

  return (loadTemplate.cache[tmpl] = (await fsPromises.readFile(
    tmpl
  )).toString());
}
loadTemplate.cache = {};

const cleanCSS = new CleanCSS({
  level: 2
});

async function render(tmpl, data) {
  return mustache.render(
    await loadTemplate(path.resolve(__dirname, tmpl)),
    {
      fas,
      far,
      fab,
      ...data
    },
    {
      header: await loadTemplate(path.resolve(__dirname, "header.mustache")),
      footer: await loadTemplate(path.resolve(__dirname, "footer.mustache")),
      "header.js": await loadTemplate(
        path.resolve(__dirname, "header.js"),
        code => {
          let c = UglifyJS.minify(code).code;
          if (!c) {
            throw new Error("Empty header.js");
          }
          return c;
        }
      ),
      "header.css": await loadTemplate(
        path.resolve(__dirname, "header.css"),
        code => cleanCSS.minify(code).styles
      ),
      "highlight.css": await loadTemplate(
        path.resolve(__dirname, "highlight.css"),
        code => cleanCSS.minify(code).styles
      ),
      "settings.js": await loadTemplate(
        path.resolve(__dirname, "settings.js"),
        code => {
          let c = UglifyJS.minify(code).code;
          if (!c) {
            throw new Error("Empty settings.js");
          }
          return c;
        }
      ),
      "settings.css": await loadTemplate(
        path.resolve(__dirname, "settings.css"),
        code => cleanCSS.minify(code).styles
      ),
      gauges: await loadTemplate(path.resolve(__dirname, "gauges.mustache"))
    }
  );
}

module.exports = { render };
