const path = require("path");
const marked = require("marked");
const cheerio = require("cheerio");
const mustache = require("mustache");
const UglifyJS = require("uglify-js");
const CleanCSS = require("clean-css");
const { promisify } = require("util");

const fs = require("fs");
const fsPromises = {
  readFile: promisify(fs.readFile)
};

const fontAwesomeSVGReducer = (acc, icon) =>
  icon.icon ? { ...acc, [icon.iconName]: icon.icon[4] } : acc;

const fas = Object.values(
  require("@fortawesome/fontawesome-free-solid")
).reduce(fontAwesomeSVGReducer, {});
const fab = Object.values(
  require("@fortawesome/fontawesome-free-brands")
).reduce(fontAwesomeSVGReducer, {});

const PAGE_SIZE = 10;
const MINIMUM_INDEX_PAGE_SIZE = 5;
const BLOG_TITLE = "zemlan.in";
const BLOG_BASE_URL = process.env.BLOG_BASE_URL || ".";

const renderer = new marked.Renderer();
const ogImage = renderer.image.bind(renderer);
const ogLink = renderer.link.bind(renderer);
const ogHTML = renderer.html.bind(renderer);
const ogParagraph = renderer.paragraph.bind(renderer);
renderer.image = function(href, title, text) {
  const youtubeId = href.match(
    /(youtu\.be\/|youtube\.com\/watch\?v=)([^&\\]+)/
  );
  if (youtubeId) {
    href = `https://www.youtube.com/embed/${youtubeId[2]}`;
  }

  const vimeoId = href.match(/(vimeo\.com\/)(\d+)/);
  if (vimeoId) {
    href = `https://player.vimeo.com/video/${vimeoId[2]}`;
  }

  const funnyOrDieId = href.match(
    /\/\/www\.funnyordie\.com\/videos\/([0-9a-f]+)/
  );
  if (funnyOrDieId) {
    href = `https://www.funnyordie.com/embed/${funnyOrDieId[1]}`;
  }

  const appleMusicPath = href.match(/https:\/\/itunes\.apple\.com\/(.+)/);
  if (appleMusicPath) {
    href = `https://embed.music.apple.com/${appleMusicPath[1]}`;
  }

  if (href.indexOf("//www.youtube.com/embed/") > -1) {
    const youtubeId = href.match(/\/embed\/([^?]+)/)[1];

    const imgSrc = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
    const dataSrc =
      href +
      (href.indexOf("?") === -1
        ? "?rel=0&modestbranding=1&playsinline=1"
        : "&rel=0&modestbranding=1&playsinline=1");
    const ytHref = `https://www.youtube.com/watch?v=${youtubeId}`;

    return `<a class="future-frame" href="${ytHref}" data-src="${dataSrc}">
      <img src="${imgSrc}">
    </a>`;
  }

  if (href.indexOf("//player.vimeo.com/video/") > -1) {
    return `<iframe src="${href}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;
  }

  if (href.indexOf("//www.funnyordie.com/embed/") > -1) {
    return `<iframe src="${href}" width="640" height="360" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
  }

  if (href.indexOf("//embed.music.apple.com/") > -1) {
    const height =
      href.indexOf("/album/") > -1 && href.match(/[?&]i=\d+/)
        ? 150 // track
        : 360; // album/playlist
    return `<iframe width="640" height="${height}" allow="autoplay *; encrypted-media *;" frameborder="0" sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation" src="${href}"></iframe>`;
  }

  if (href.startsWith("/media/")) {
    href = process.env.BLOG_BASE_URL
      ? process.env.BLOG_BASE_URL + href
      : href.slice(1);
  }

  if (
    (href.startsWith("media/") && href.endsWith(".mp4")) ||
    (text && text.indexOf("poster=") > -1)
  ) {
    const attrs =
      text &&
      text
        .replace(/&apos;/g, `'`)
        .replace(/&quot;/g, `"`)
        .replace(
          /((src|href|poster)=['"]?)\/media\//g,
          `$1${
            process.env.BLOG_BASE_URL ? process.env.BLOG_BASE_URL + "/" : ""
          }media/`
        );

    return `<video playsinline controls preload="none" src="${href}" ${attrs ||
      ""}></video>`;
  }

  return ogImage(href, title, text);
};

renderer.link = function(href, title, text) {
  if (href.startsWith("/media/")) {
    href = process.env.BLOG_BASE_URL
      ? process.env.BLOG_BASE_URL + href
      : href.slice(1);
  }

  return ogLink(href, title, text);
};

renderer.html = function(html) {
  html = html.replace(
    /((src|href|poster)=['"]?)\/media\//g,
    `$1${
      process.env.BLOG_BASE_URL ? process.env.BLOG_BASE_URL + "/" : ""
    }media/`
  );

  return ogHTML(html);
};

renderer.paragraph = function(text) {
  text = text.replace(
    /((src|href|poster)=['"]?)\/media\//g,
    `$1${
      process.env.BLOG_BASE_URL ? process.env.BLOG_BASE_URL + "/" : ""
    }media/`
  );

  return ogParagraph(text);
};

marked.setOptions({
  gfm: true,
  smartypants: false,
  renderer: renderer,
  highlight: function(code, lang) {
    return require('highlight.js')
      .highlightAuto(code, lang ? [lang] : undefined)
      .value;
  },
  baseUrl: process.env.BLOG_BASE_URL || null
});

function getPostUrl(post) {
  return `${BLOG_BASE_URL}/${post.slug || post.id}.html`;
}

const WORD_REGEX = /[a-zA-Z0-9_\u0392-\u03c9\u0400-\u04FF]+|[\u4E00-\u9FFF\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\uac00-\ud7af\u0400-\u04FF]+|[\u00E4\u00C4\u00E5\u00C5\u00F6\u00D6]+|\w+/g;

function pluralize(n, ...forms) {
  const singular = n % 10 === 1 && n % 100 != 11;
  if (singular) {
    return forms[0];
  } else if (forms.length === 2) {
    return forms[1];
  } else {
    const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20);
    if (few) {
      return forms[1];
    } else {
      return forms[2];
    }
  }
}

function isTeaserToken(token) {
  return (
    token &&
    token.type === "paragraph" &&
    token.text.match(/^(_.+_|!\[.*\]\(.+\))$/)
  );
}

function prepare(post) {
  const tokens = marked.lexer(post.text);

  const header1Token =
    tokens && tokens[0] && tokens[0].type === "heading" && tokens[0].text
      ? tokens[0]
      : null;

  const created = new Date(parseInt(post.created));

  let title = post.slug || created.toISOString().split("T")[0];
  const url = getPostUrl(post);
  let longread = null;
  let html = null;

  if (header1Token) {
    const htmlTitle = marked(
      "#".repeat(header1Token.depth) + " " + `[${header1Token.text}](${url})`
    );
    title = cheerio.load(htmlTitle).text();
    post.text = post.text.replace(
      header1Token.text,
      `[${header1Token.text}](${url})`
    );
    html = marked(post.text.replace(/¯\\_\(ツ\)_\/¯/g, "¯\\\\\\_(ツ)\\_/¯"));

    if (tokens.length > 5) {
      const wordCount = cheerio(html)
        .text()
        .match(WORD_REGEX).length;

      if (wordCount > 200) {
        longread = {
          title: htmlTitle,
          more: pluralize(
            wordCount,
            `${wordCount} слово`,
            `${wordCount} слова`,
            `${wordCount} слов`
          )
        };

        longread.teaser = isTeaserToken(tokens[1])
          ? marked(
              tokens
                .slice(1, 4)
                .filter(isTeaserToken)
                .slice(0, 2)
                .map(t => t.text)
                .join("\n\n")
            )
          : "";
      }
    }
  } else {
    html = marked(post.text.replace(/¯\\_\(ツ\)_\/¯/g, "¯\\\\\\_(ツ)\\_/¯"));
  }

  let status;
  if (post.draft) {
    status = "draft";
  } else if (post.private) {
    status = "private";
  } else if (post.public) {
    status = "public";
  }

  return {
    id: post.id,
    slug: post.slug,
    draft: post.draft,
    private: post.private,
    public: post.public,
    status: status,
    url,
    title,
    html,
    longread,
    text: post.text,
    created: created.toISOString().replace(/\.\d{3}Z$/, "Z"),
    createdDate: created.toISOString().split("T")[0],
    createdUTC: created.toUTCString(),
    modified: post.modified
      ? new Date(parseInt(post.modified)).toISOString()
      : null
  };
}

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
      fab,
      ...data
    },
    {
      header: await loadTemplate(
        path.resolve(__dirname, "templates", "header.mustache")
      ),
      footer: await loadTemplate(
        path.resolve(__dirname, "templates", "footer.mustache")
      ),
      "header.js": await loadTemplate(
        path.resolve(__dirname, "templates", "header.js"),
        code => UglifyJS.minify(code).code
      ),
      "header.css": await loadTemplate(
        path.resolve(__dirname, "templates", "header.css"),
        code => cleanCSS.minify(code).styles
      ),
      "highlight.css": await loadTemplate(
        path.resolve(__dirname, "node_modules", "highlight.js/styles/default.css"),
        code => cleanCSS.minify(code).styles
      ),
      gauges: await loadTemplate(
        path.resolve(__dirname, "templates", "gauges.mustache")
      )
    }
  );
}

module.exports = {
  BLOG_TITLE,
  BLOG_BASE_URL,
  PAGE_SIZE,
  MINIMUM_INDEX_PAGE_SIZE,
  prepare,
  render,
  renderer
};
