const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const mustache = require("mustache");
const terser = require("terser");
const CleanCSS = require("clean-css");

const fsPromises = {
  readFile: promisify(fs.readFile),
};

const { fas, far, fab } = require("./font-awesome-mustache.js");

async function loadTemplate(tmpl, processCallback) {
  if (loadTemplate.cache[tmpl]) {
    return loadTemplate.cache[tmpl];
  }

  if (processCallback) {
    return (loadTemplate.cache[tmpl] = processCallback(
      (await fsPromises.readFile(tmpl)).toString()
    ));
  }

  return (loadTemplate.cache[tmpl] = (
    await fsPromises.readFile(tmpl)
  ).toString());
}
loadTemplate.cache = {};

const cleanCSS = new CleanCSS({
  level: 2,
});

const BLOG_TEMPLATES = path.resolve(__dirname, "templates");
const jsProcess = (code) => {
  const m = terser.minify(code);
  if (m.error) {
    throw m.error;
  }
  return m.code;
};

const cssProcess = (code) => cleanCSS.minify(code).styles;

async function blogRender(tmpl, data) {
  return mustache.render(
    await loadTemplate(path.resolve(BLOG_TEMPLATES, tmpl)),
    {
      fas,
      far,
      fab,
      ...data,
    },
    {
      header: await loadTemplate(path.join(BLOG_TEMPLATES, "header.mustache")),
      footer: await loadTemplate(path.join(BLOG_TEMPLATES, "footer.mustache")),
      "polyfills.js": await loadTemplate(
        path.join(BLOG_TEMPLATES, "polyfills.js"),
        jsProcess
      ),
      "header.js": await loadTemplate(
        path.join(BLOG_TEMPLATES, "header.js"),
        jsProcess
      ),
      "header.css": await loadTemplate(
        path.join(BLOG_TEMPLATES, "header.css"),
        cssProcess
      ),
      "highlight.css": await loadTemplate(
        path.join(BLOG_TEMPLATES, "highlight.css"),
        cssProcess
      ),
    }
  );
}

module.exports = { blogRender, render: blogRender, blog: blogRender };
