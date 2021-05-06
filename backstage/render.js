const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const CleanCSS = require("clean-css");

const fsPromises = {
  readFile: promisify(fs.readFile),
};

const mustache = require("mustache");

const { fas, far, fab } = require("../font-awesome-mustache.js");
const { getStaticsObject } = require("../render.js");

async function loadTemplate(tmpl, processCallback) {
  if (process.env.NODE_ENV === "development") {
    const result = (await fsPromises.readFile(tmpl)).toString();

    if (processCallback) {
      return processCallback(result, { tmpl });
    }

    return result;
  }

  if (loadTemplate.cache[tmpl]) {
    return loadTemplate.cache[tmpl];
  }

  if (processCallback) {
    return (loadTemplate.cache[tmpl] = processCallback(
      (await fsPromises.readFile(tmpl)).toString(),
      { tmpl }
    ));
  }

  return (loadTemplate.cache[tmpl] = (
    await fsPromises.readFile(tmpl)
  ).toString());
}
loadTemplate.cache = {};

const BACKSTAGE_TEMPLATES = path.resolve(__dirname, "templates");
const BLOG_TEMPLATES = path.resolve(__dirname, "..", "templates");

const cleanCSS = new CleanCSS({
  level: {
    1: {
      transform: function (propertyName, propertyValue, selector) {
        if (
          selector.indexOf("article") === -1 &&
          selector !== "to" &&
          selector !== "from"
        ) {
          return false;
        }

        if (selector === "article" && propertyName === "margin-bottom") {
          return false;
        }
      },
    },
  },
});

const jsProcess = async (code) => {
  if (code.includes("window.__statics__")) {
    const statics = JSON.stringify(await getStaticsObject());
    code = `(window.__statics__ = window.__statics__ || ${statics}); ${code}`;
  }
  return code;
};

async function backstageRender(tmpl, data) {
  return mustache.render(
    await loadTemplate(path.resolve(BACKSTAGE_TEMPLATES, tmpl)),
    {
      fas,
      far,
      fab,
      ...data,
    },
    {
      "bulma.css": await loadTemplate(require.resolve("bulma/css/bulma.css")),
      "media-bar.js": await loadTemplate(
        path.join(BACKSTAGE_TEMPLATES, "media-bar.js")
      ),
      "media-bar.mustache": await loadTemplate(
        path.join(BACKSTAGE_TEMPLATES, "media-bar.mustache")
      ),
      "header.blog.css": await loadTemplate(
        path.join(BLOG_TEMPLATES, "header.css"),
        (code) =>
          cleanCSS.minify(
            code + `\narticle h1 { font-size: 2em; font-weight: bold; }`
          ).styles
      ),
      "header.blog.js": await loadTemplate(
        path.join(BLOG_TEMPLATES, "header.js"),
        jsProcess
      ),
    }
  );
}

module.exports = {
  backstageRender,
  render: backstageRender,
  backstage: backstageRender,
};
