const fs = require("fs");
const url = require("url");
const path = require("path");
const zlib = require("zlib");
const { promisify } = require("util");

const mime = require("mime");
const marked = require("marked");
const cheerio = require("cheerio");
const mustache = require("mustache");
const UglifyJS = require("uglify-js");
const CleanCSS = require("clean-css");

const fsPromises = {
  readFile: promisify(fs.readFile),
  writeFile: promisify(fs.writeFile),
  unlink: promisify(fs.unlink),
  exists: promisify(fs.exists)
};

const zlibPromises = {
  gzip: promisify(zlib.gzip)
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
const PORT = process.env.PORT || 8000;
const BLOG_BASE_URL = process.env.BLOG_BASE_URL || ".";
const DIST = path.resolve(__dirname, process.env.DIST || "dist");
const POSTS_DB = path.resolve(__dirname, process.env.POSTS_DB || "posts.db");

function isOwnMedia(href) {
  return (
    (process.env.BLOG_BASE_URL &&
      href.startsWith(process.env.BLOG_BASE_URL + "/media/")) ||
    href.startsWith("media/") ||
    href.startsWith("/media/")
  );
}

function getMimeObj(href, fullMimeType) {
  fullMimeType = fullMimeType || mime.getType(href) || "";
  const type = (fullMimeType && fullMimeType.split("/")[0]) || "";

  return {
    image: type === "image",
    video: type === "video",
    audio: type === "audio",
    text:
      type === "text" ||
      fullMimeType === "application/javascript" ||
      fullMimeType === "application/json",
    pdf: fullMimeType === "application/pdf"
  };
}

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

  const appleMusicPath = href.match(
    //         ($1          )              ($2)
    /https:\/\/(itunes|music)\.apple\.com\/(.+)/
  );
  if (appleMusicPath) {
    href = `https://embed.music.apple.com/${appleMusicPath[2]}`;
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

  if (process.env.BLOG_BASE_URL && href.startsWith("/media/")) {
    href = process.env.BLOG_BASE_URL + href;
  } else if (process.env.BLOG_BASE_URL && href.startsWith("media/")) {
    href = process.env.BLOG_BASE_URL + "/" + href;
  } else if (href.startsWith("media/")) {
    href = "/" + href;
  }

  const mimeObj = getMimeObj(href);

  if (
    (isOwnMedia(href) || (text && text.indexOf("poster=") > -1)) &&
    mimeObj.video
  ) {
    let attrs =
      text &&
      text
        .replace(/&apos;/g, `'`)
        .replace(/&quot;/g, `"`)
        .replace(
          /((src|href|poster)=['"]?)\/?media\//g,
          `$1${process.env.BLOG_BASE_URL || ""}/media/`
        );

    const isGIFVattr = attrs.match(/(^|\s+)gifv($|\s+)/g);
    const isOwnGIFV = isOwnMedia(href) && href.indexOf("/gifv.mp4") > -1;

    if (isGIFVattr || isOwnGIFV) {
      attrs = isGIFVattr ? attrs.replace(isGIFVattr[0], ``) : attrs;
      return `<video playsinline autoplay muted loop src="${href}" ${attrs}></video>`;
    }

    return `<video playsinline controls preload="none" src="${href}" ${attrs ||
      ""}></video>`;
  }

  if (isOwnMedia(href) && mimeObj.pdf) {
    const frameSrc = `https://drive.google.com/viewerng/viewer?pid=explorer&efh=false&a=v&chrome=false&embedded=true&url=${encodeURIComponent(
      href
    )}`;

    if (text && text.indexOf("poster=") > -1) {
      const attrs =
        text &&
        text
          .replace(/&apos;/g, `'`)
          .replace(/&quot;/g, `"`)
          .replace(
            /((src|href|poster)=['"]?)\/media\//g,
            `$1${process.env.BLOG_BASE_URL || ""}/media/`
          );

      const imgSrc = attrs.match(/poster=['"]?([^'" ]+)['"]?/)[1];
      return `<a class="future-frame" href="${href}" data-src="${frameSrc}">
        <img src="${imgSrc}">
      </a>`;
    } else {
      return `<iframe src="${frameSrc}"
        frameborder="0"
        width="640"
        height="360"
        allow="autoplay; encrypted-media"
        allowfullscreen="1"
      ></iframe>`;
    }
  }

  if (href.startsWith("data:text/html;base64")) {
    const frameSrc = href;
    let imgSrc = null;

    if (text && text.indexOf("poster=") > -1) {
      const attrs =
        text &&
        text
          .replace(/&apos;/g, `'`)
          .replace(/&quot;/g, `"`)
          .replace(
            /((src|href|poster)=['"]?)\/media\//g,
            `$1${process.env.BLOG_BASE_URL || ""}/media/`
          );

      imgSrc = attrs.match(/poster=['"]?([^'" ]+)['"]?/)[1];
    } else {
      let lines = [`<tspan x="0" dy="12">data:text/html</tspan>`].concat(
        frameSrc
          .slice("data:text/html;base64,".length)
          .split(/(.{25})/)
          .filter(Boolean)
          .slice(0, 6)
          .map(line => `<tspan x="0" dy="12">${line}</tspan>`)
      );

      if (text) {
        lines = [
          ...lines.slice(0, 3),
          `<tspan x="80" dy="12" fill="#00a500" text-anchor="middle">${text}</tspan>`,
          ...lines.slice(3, 6)
        ];
      }

      imgSrc =
        "data:image/svg+xml;utf8," +
        encodeURIComponent(
          `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90">
              <defs><style type="text/css">
                text {
                  font-size: 11px;
                  font-family: "SF Mono", "Menlo-Regular", Consolas, "Andale Mono WT",
                    "Andale Mono", "Lucida Console", "Lucida Sans Typewriter",
                    "DejaVu Sans Mono", "Bitstream Vera Sans Mono", "Liberation Mono",
                    "Nimbus Mono L", Monaco, "Courier New", Courier, monospace;
                }
              </style></defs>
              <rect x="0" y="0" height="90" width="160" fill="white" />
              <text x="0" y="0" fill="#888">${lines.join("")}</text>
            </svg>
          `.replace(/^\s+/gm, "")
        );
    }

    return `<a class="future-frame" href="${href}" data-src="${frameSrc}" data-background="#fff">
      <img src="${imgSrc}">
    </a>`;
  }

  return ogImage(href, title, text);
};

renderer.link = function(href, title, text) {
  if (href.startsWith("/media/")) {
    href = process.env.BLOG_BASE_URL ? process.env.BLOG_BASE_URL + href : href;
  }

  return ogLink(href, title, text);
};

renderer.html = function(html) {
  html = html.replace(
    /((src|href|poster)=['"]?)\/?media\//g,
    `$1${process.env.BLOG_BASE_URL || ""}/media/`
  );

  return ogHTML(html);
};

renderer.paragraph = function(text) {
  text = text.replace(
    /((src|href|poster)=['"]?)\/?media\//g,
    `$1${process.env.BLOG_BASE_URL || ""}/media/`
  );

  return ogParagraph(text);
};

marked.setOptions({
  gfm: true,
  smartypants: false,
  renderer: renderer,
  highlight: function(code, lang) {
    return require("highlight.js").highlightAuto(
      code,
      lang ? [lang] : undefined
    ).value;
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

function escapeKaomoji(str) {
  return str.replace(/¯\\_\(ツ\)_\/¯/g, "¯\\\\\\_(ツ)\\_/¯");
}

function prepare(post) {
  post.text = escapeKaomoji(post.text);
  const tokens = marked.lexer(post.text);
  const assignLinks = ts => {
    if (ts) {
      ts.links = tokens.links;
    }
    return ts;
  };

  const header1Token =
    tokens && tokens[0] && tokens[0].type === "heading" && tokens[0].text
      ? tokens[0]
      : null;

  const created = new Date(parseInt(post.created));

  let title = post.slug || created.toISOString().split("T")[0];
  let htmlTitle = null;
  let longread = null;
  let html = null;

  post.url = getPostUrl(post);
  const rss = {
    title: null
  };

  const opengraph = {
    url: post.url,
    title: title,
    description: null,
    image: null
  };

  if (header1Token) {
    const headerPrefix = "#".repeat(header1Token.depth);
    htmlTitle = marked(`${headerPrefix} [${header1Token.text}](${post.url})`);
    rss.title = title = cheerio
      .load(htmlTitle)
      .text()
      .trim();

    const tokensWithoutTitle = tokens.slice(1);
    html = marked.parser(assignLinks([...tokensWithoutTitle]));

    const teaser = isTeaserToken(tokensWithoutTitle[0])
      ? marked.parser(
          assignLinks([
            ...tokensWithoutTitle
              .slice(0, 3)
              .filter(isTeaserToken)
              .slice(0, 2)
          ])
        )
      : "";
    const parsedTeaser = teaser && cheerio.load(teaser);
    opengraph.image =
      parsedTeaser &&
      (parsedTeaser("img").attr("src") ||
        parsedTeaser("[poster]").attr("poster"));
    opengraph.title = title.trim();

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

        longread.teaser =
          teaser +
          `\n<a href="${post.url}" class="more">${longread.more} &rarr;</a>`;
      }

      opengraph.description =
        (teaser && parsedTeaser.text().trim()) ||
        (longread && longread.more) ||
        null;
    }
  } else {
    rss.html = html = marked(post.text);
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
    url: post.url,
    status,
    title,
    htmlTitle,
    html,
    longread,
    rss,
    opengraph,
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

async function getBlogObject(/* db */) {
  return {
    title: BLOG_TITLE,
    url: url.resolve(BLOG_BASE_URL, "/"),
    feed: {
      description: `Everything feed - ${BLOG_TITLE}`,
      url: url.resolve(BLOG_BASE_URL, "/rss.xml")
    },
    static: {
      favicon: {
        ico: url.resolve(BLOG_BASE_URL, "/favicon.ico"),
        png: url.resolve(BLOG_BASE_URL, "/favicon.png"),
        svg: url.resolve(BLOG_BASE_URL, "/favicon.svg")
      },
      "mask-icon": {
        svg: url.resolve(BLOG_BASE_URL, "/mask-icon.svg")
      }
    }
  };
}

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
        code => {
          let c = UglifyJS.minify(code).code;
          if (!c) {
            throw new Error("Empty header.js");
          }
          return c;
        }
      ),
      "header.css": await loadTemplate(
        path.resolve(__dirname, "templates", "header.css"),
        code => cleanCSS.minify(code).styles
      ),
      "highlight.css": await loadTemplate(
        path.resolve(__dirname, "templates", "highlight.css"),
        code => cleanCSS.minify(code).styles
      ),
      gauges: await loadTemplate(
        path.resolve(__dirname, "templates", "gauges.mustache")
      )
    }
  );
}

async function writeFileWithGzip(path, content, flags) {
  await fsPromises.writeFile(path, content, flags);

  await fsPromises.writeFile(
    path + ".gz",
    await zlibPromises.gzip(content),
    flags
  );
}

async function unlinkFileWithGzip(path) {
  if (await fsPromises.exists(path)) {
    await fsPromises.unlink(path);
  }

  if (await fsPromises.exists(path + ".gz")) {
    await fsPromises.unlink(path + ".gz");
  }
}

module.exports = {
  BLOG_TITLE,
  BLOG_BASE_URL,
  DIST,
  PORT,
  POSTS_DB,
  PAGE_SIZE,
  MINIMUM_INDEX_PAGE_SIZE,
  getMimeObj,
  getBlogObject,
  prepare,
  render,
  renderer,
  writeFileWithGzip,
  unlinkFileWithGzip
};
