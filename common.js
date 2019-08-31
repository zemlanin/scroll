const fs = require("fs");
const url = require("url");
const path = require("path");
const zlib = require("zlib");
const { promisify } = require("util");

const mime = require("mime");
const marked = require("marked");
const cheerio = require("cheerio");

const fsPromises = {
  writeFile: promisify(fs.writeFile),
  unlink: promisify(fs.unlink),
  exists: promisify(fs.exists)
};

const zlibPromises = {
  gzip: promisify(zlib.gzip)
};

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

const textRenderer = new marked.TextRenderer();
textRenderer.paragraph = function(text) {
  return text + "\n\n";
};
textRenderer.image = function() {
  return "";
};

const renderer = new marked.Renderer();
const ogImage = renderer.image.bind(renderer);
const ogLink = renderer.link.bind(renderer);
const ogHTML = renderer.html.bind(renderer);
const ogParagraph = renderer.paragraph.bind(renderer);

function embedCallback(href, title, text) {
  if (process.env.BLOG_BASE_URL && href.startsWith("/media/")) {
    href = process.env.BLOG_BASE_URL + href;
  } else if (process.env.BLOG_BASE_URL && href.startsWith("media/")) {
    href = process.env.BLOG_BASE_URL + "/" + href;
  } else if (href.startsWith("media/")) {
    href = "/" + href;
  }

  const mimeObj = getMimeObj(href);
  const hrefIsDataURI = href.startsWith("data:text/html;base64");
  const hrefIsOwnMedia = isOwnMedia(href);

  if (
    (hrefIsOwnMedia || (text && text.indexOf("poster=") > -1)) &&
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
    const isOwnGIFV = hrefIsOwnMedia && href.indexOf("/gifv.mp4") > -1;

    if (isGIFVattr || isOwnGIFV) {
      attrs = isGIFVattr ? attrs.replace(isGIFVattr[0], ``) : attrs;
      return `<video playsinline autoplay muted loop src="${href}" ${attrs}></video>`;
    }

    return `<video playsinline controls preload="none" src="${href}" ${attrs ||
      ""}></video>`;
  }

  if (hrefIsOwnMedia && mimeObj.pdf) {
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
        <img src="${imgSrc}" loading="lazy">
      </a>`;
    } else {
      return `<iframe src="${frameSrc}"
        frameborder="0"
        width="640"
        height="360"
        allow="autoplay; encrypted-media"
        allowfullscreen="1"
        loading="lazy"
      ></iframe>`;
    }
  }

  if (hrefIsDataURI) {
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

  if (hrefIsOwnMedia && mimeObj.text) {
    return `<iframe src="${href}" width="640" height="360" frameborder="0" loading="lazy"></iframe>`;
  }

  if (!hrefIsDataURI && !hrefIsOwnMedia && !mimeObj.image) {
    return `<x-embed>${JSON.stringify({ href, title, text })}</x-embed>`;
  }

  return ogImage(href, title, text).replace(/(\/?>)$/, ' loading="lazy" $1');
}

renderer.image = embedCallback;

renderer.link = function(href, title, text) {
  if (text.startsWith("^")) {
    const footnoteId = href;
    const footnoteText = text.slice(1);
    return `<sup><a href="#fn:${footnoteId}" id="rfn:${footnoteId}" rel="footnote">${footnoteText}</a></sup>`;
  }

  if (href.startsWith("/media/") && process.env.BLOG_BASE_URL) {
    href = process.env.BLOG_BASE_URL + href;
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
  return Boolean(
    token &&
      token.type === "paragraph" &&
      token.text.match(/^(_.+_|!\[.*\]\(.+\))$/)
  );
}

function escapeKaomoji(str) {
  return str.replace(/¯\\_\(ツ\)_\/¯/g, "¯\\\\\\_(ツ)\\_/¯");
}

function getMarkedOptions() {
  return {
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
  };
}

function generateFootnotes(tokens) {
  let result = `<div class="footnotes"><hr/><ol>`;

  for (const linkId in tokens.links) {
    if (!linkId.startsWith("^")) {
      continue;
    }

    const footnoteId = tokens.links[linkId].href;
    const text = marked(
      tokens.links[linkId].title +
        ` <a href="#rfn:${footnoteId}" rev="footnote">&#8617;</a>`
    );
    result += `<li id="fn:${footnoteId}">${text}</li>`;
  }

  result += "</ol></div>";

  return result;
}

function prepareFootnoteLinks(tokens, postId) {
  for (const linkId in tokens.links) {
    if (!linkId.startsWith("^")) {
      continue;
    }

    tokens.links[linkId].href = `${postId}:${linkId.slice(1)}`;
  }
}

async function prepare(post, embedsLoader) {
  post.text = escapeKaomoji(post.text);

  const markedOptions = getMarkedOptions();

  const tokens = marked.lexer(post.text, markedOptions);
  prepareFootnoteLinks(tokens, post.id);
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
    htmlTitle = marked.parse(
      `${headerPrefix} [${header1Token.text}](${post.url})`,
      markedOptions
    );

    htmlTitle = await embedsLoader.load(htmlTitle);

    rss.title = title = cheerio
      .load(htmlTitle)
      .text()
      .trim();

    const tokensWithoutTitle = tokens.slice(1);
    html = marked.parser(assignLinks([...tokensWithoutTitle]), markedOptions);

    if (
      tokens.links &&
      Object.keys(tokens.links).find(t => t.startsWith("^"))
    ) {
      html = html + generateFootnotes(tokens);
    }

    html = await embedsLoader.load(html);

    let teaser = isTeaserToken(tokensWithoutTitle[0])
      ? marked.parser(
          assignLinks([
            ...tokensWithoutTitle
              .slice(0, 3)
              .filter(isTeaserToken)
              .slice(0, 2)
          ]),
          markedOptions
        )
      : "";

    teaser = await embedsLoader.load(teaser);

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

      const description =
        teaser &&
        marked
          .parser(
            assignLinks([
              ...tokensWithoutTitle
                .slice(0, 3)
                .filter(isTeaserToken)
                .slice(0, 2)
            ]),
            {
              ...markedOptions,
              renderer: textRenderer
            }
          )
          .trim();

      opengraph.description =
        description || (longread && longread.more) || null;
    }
  } else {
    html = marked.parser(tokens, markedOptions);
    if (
      tokens.links &&
      Object.keys(tokens.links).find(t => t.startsWith("^"))
    ) {
      html = html + generateFootnotes(tokens);
    }
    rss.html = html = await embedsLoader.load(html);
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

async function getBlogObject(baseUrl) {
  if (!baseUrl) {
    baseUrl = BLOG_BASE_URL;
  }

  return {
    title: BLOG_TITLE,
    url: url.resolve(baseUrl, "/"),
    feed: {
      description: `Everything feed - ${BLOG_TITLE}`,
      url: url.resolve(baseUrl, "/rss.xml")
    },
    static: {
      favicon: {
        ico: url.resolve(baseUrl, "/favicon.ico"),
        png: url.resolve(baseUrl, "/favicon.png"),
        svg: url.resolve(baseUrl, "/favicon.svg")
      },
      "mask-icon": {
        svg: url.resolve(baseUrl, "/mask-icon.svg")
      }
    }
  };
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

function loadIcu(db) {
  return new Promise((resolve, reject) => {
    if (!process.env.SQLITE_ICU) {
      return resolve(db);
    }

    return db.driver.loadExtension(
      path.resolve(__dirname, process.env.SQLITE_ICU),
      error => (error ? reject(error) : resolve(db))
    );
  });
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
  loadIcu,
  embedCallback,
  writeFileWithGzip,
  unlinkFileWithGzip
};
