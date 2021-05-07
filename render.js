const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const crypto = require("crypto");

const mustache = require("mustache");
const terser = require("terser");
const CleanCSS = require("clean-css");

const fsPromises = {
  readFile: promisify(fs.readFile),
  stat: promisify(fs.stat),
  lstat: promisify(fs.lstat),
  readdir: promisify(fs.readdir),
};

const { fas, far, fab } = require("./font-awesome-mustache.js");

async function loadTemplate(tmpl, processCallback) {
  if (loadTemplate.cache[tmpl]) {
    return loadTemplate.cache[tmpl];
  }

  if (processCallback) {
    return (loadTemplate.cache[tmpl] = await processCallback(
      (await fsPromises.readFile(tmpl)).toString(),
      { tmpl }
    ));
  }

  return (loadTemplate.cache[tmpl] = (
    await fsPromises.readFile(tmpl)
  ).toString());
}
loadTemplate.cache = {};

const cleanCSS = new CleanCSS({
  level: {
    2: {
      // https://github.com/jakubpawlowicz/clean-css/issues/1022
      mergeIntoShorthands: false,
    },
  },
});

const BLOG_TEMPLATES = path.resolve(__dirname, "templates");
const jsProcess = async (code) => {
  if (code.includes("window.__statics__")) {
    const statics = JSON.stringify(await getStaticsObject());

    code = `(window.__statics__ = window.__statics__ || ${statics}); ${code}`;
  }
  const m = await terser.minify(code);
  return m.code;
};

const cssProcess = (code) => cleanCSS.minify(code).styles;

const translations = {
  ru: {
    archive: "архив",
    search: "поиск",
    play: "запустить",
    Settings: "Настройки",
    "Dark theme": "Тёмная тема",
    "Default theme": "Тема по умолчанию",
    "Light theme": "Светлая тема",
    "page {{number}}": "страница {{number}}",
    index: "главная",
    linkblog: "linkblog",
    "Follow via RSS": "Читать с помощью RSS",
    Share: "Поделиться",
    "Support on Patreon": "Поддержать на Патреоне",
  },
  uk: {
    archive: "архів",
    search: "пошук",
    play: "виконати",
    Settings: "Налаштування",
    "Dark theme": "Темна тема",
    "Default theme": "Тема за замовчуванням",
    "Light theme": "Світла тема",
    "page {{number}}": "сторінка {{number}}",
    index: "головна",
    linkblog: "linkblog",
    "Follow via RSS": "Читати за допомогою RSS",
    Share: "Поділитися",
    "Support on Patreon": "Підтримати на Патреоні",
  },
};

function translate() {
  // DEBT use `getBlogObject().lang` as a fallback instead of hardcoded "ru"
  const lang = this.lang || (this.blog && this.blog.lang) || "ru";

  if (lang === "en") {
    return function (text, render) {
      return render(text);
    };
  }

  return function (text, render) {
    const i18nKey = text;
    const translation = translations[lang] && translations[lang][i18nKey];

    if (translation) {
      return render(translation);
    }

    if (lang === "en") {
      return render(i18nKey);
    }

    throw new Error(
      `No translation found for string "${i18nKey}" (lang: ${lang})`
    );
  };
}

const STATICS = path.resolve(__dirname, "static");
const appendStaticHash = async (content, { tmpl }) => {
  const sha = crypto.createHash("sha1");
  sha.update(content);
  return `${tmpl.replace(STATICS, "")}?_=${sha
    .digest("base64url")
    .slice(0, 8)}`;
};
const getStaticsObject = async () => {
  const result = {};

  for (const filename of await fsPromises.readdir(STATICS)) {
    if ((filename && filename[0] == ".") || filename === "robots.txt") {
      continue;
    }

    const filepath = path.resolve(STATICS, filename);

    if ((await fsPromises.lstat(filepath)).isDirectory()) {
      throw new Error("getStaticsObject() doesn't support directories");
    }

    result[`/${filename}`] = await loadTemplate(filepath, appendStaticHash);
  }

  return result;
};

async function blogRender(tmpl, data) {
  return mustache.render(
    await loadTemplate(path.resolve(BLOG_TEMPLATES, tmpl)),
    {
      fas,
      far,
      fab,
      t: translate,
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
      "normalize.css": await loadTemplate(
        require.resolve("normalize.css"),
        cssProcess
      ),
      "header.css": await loadTemplate(
        path.join(BLOG_TEMPLATES, "header.css"),
        cssProcess
      ),
      "highlight.css": await loadTemplate(
        path.join(BLOG_TEMPLATES, "highlight-alabaster.css"),
        cssProcess
      ),
    }
  );
}

module.exports = {
  blogRender,
  render: blogRender,
  blog: blogRender,
  getStaticsObject,
};
