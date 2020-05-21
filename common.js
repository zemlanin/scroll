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
  exists: promisify(fs.exists),
};

const zlibPromises = {
  gzip: promisify(zlib.gzip),
};

const PAGE_SIZE = 10;
const MINIMUM_INDEX_PAGE_SIZE = 5;
const BLOG_TITLE = "zemlan.in";
const PORT = process.env.PORT || 8000;
const BLOG_BASE_URL = process.env.BLOG_BASE_URL || ".";
const DIST = path.resolve(__dirname, process.env.DIST || "dist");
const POSTS_DB = path.resolve(__dirname, process.env.POSTS_DB || "posts.db");
const FOOTNOTE_MARKER = "^";

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
    pdf: fullMimeType === "application/pdf",
  };
}

const textRenderer = new marked.TextRenderer();
textRenderer.paragraph = function (text) {
  return text + "\n\n";
};
textRenderer.image = function () {
  return "";
};

const renderer = new marked.Renderer();
const ogImage = renderer.image.bind(renderer);
const ogLink = renderer.link.bind(renderer);
const ogHTML = renderer.html.bind(renderer);
const ogParagraph = renderer.paragraph.bind(renderer);
const ogList = renderer.list.bind(renderer);

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

    return `<video playsinline controls preload="none" src="${href}" ${
      attrs || ""
    }></video>`;
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
          .map((line) => `<tspan x="0" dy="12">${line}</tspan>`)
      );

      if (text) {
        lines = [
          ...lines.slice(0, 3),
          `<tspan x="80" dy="12" fill="#00a500" text-anchor="middle">${text}</tspan>`,
          ...lines.slice(3, 6),
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

renderer.link = function (href, title, text) {
  if (text.startsWith(FOOTNOTE_MARKER)) {
    if (!title) {
      return text;
    }

    const [footnoteText, footnoteId] = href.split("|");
    return `<sup><a href="#fn:${footnoteId}" id="rfn:${footnoteId}" rel="footnote">${footnoteText}</a></sup>`;
  }

  if (href.startsWith("/media/") && process.env.BLOG_BASE_URL) {
    href = process.env.BLOG_BASE_URL + href;
  }

  return ogLink(href, title, text);
};

renderer.html = function (html) {
  html = html.replace(
    /((src|href|poster)=['"]?)\/?media\//g,
    `$1${process.env.BLOG_BASE_URL || ""}/media/`
  );

  return ogHTML(html);
};

renderer.paragraph = function (text) {
  text = text.replace(
    /((src|href|poster)=['"]?)\/?media\//g,
    `$1${process.env.BLOG_BASE_URL || ""}/media/`
  );

  return ogParagraph(text);
};

renderer.list = function (body, ordered, start) {
  const isGalleryList =
    !ordered &&
    body &&
    body
      .replace(/^\s*<li>\s*|\s*<\/li>\s*$/gi, "") // remove first opening and last closing
      .split(/\s*<\/li>\s*<li>\s*/gi) // split list on `</li><li>`
      .every(
        (listitem) =>
          // check if every list item has only either an `<img>`,
          listitem.match(/^<img [^>]+>$/i) ||
          // a `<video>`,
          listitem.match(/^<video [^>]+><\/video>$/i) ||
          // or a `<x-embed>` and nothing else
          listitem.match(/^<x-embed>(?!<\/?x-embed>)[\s\S]+<\/x-embed>$/i)
      );

  if (isGalleryList) {
    return `<ul data-gallery style="list-style:none;padding:0">\n${body}</ul>\n`;
  }

  return ogList(body, ordered, start);
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

function getTeaserTokens(tokens, post) {
  const result = [];

  for (const token of tokens) {
    if (result.length >= 2) {
      break;
    }

    if (token.type === "space") {
      continue;
    } else if (token.type === "heading") {
      continue;
    } else if (token.type === "paragraph" && token.tokens.length === 1) {
      const paragraphContent = token.tokens[0];

      if (paragraphContent.type === "image") {
        result.push({
          ...token,
          raw: `![${paragraphContent.raw}](${post.url})`,
          text: `![${paragraphContent.raw}](${post.url})`,
          tokens: [
            {
              type: "link",
              raw: `![${paragraphContent.raw}](${post.url})`,
              href: post.url,
              title: null,
              text: paragraphContent.raw,
              tokens: token.tokens,
            },
          ],
        });
      } else if (
        paragraphContent.type === "link" &&
        paragraphContent.tokens &&
        paragraphContent.tokens.length === 1 &&
        paragraphContent.tokens[0].type === "image"
      ) {
        result.push(token);
      } else if (paragraphContent.type === "em") {
        result.push({
          ...token,
          tokens: [
            {
              ...paragraphContent,
              tokens: paragraphContent.tokens.filter(
                (t) =>
                  !(t.type === "link" && t.text.startsWith(FOOTNOTE_MARKER))
              ),
            },
          ],
        });
      } else {
        break;
      }
    } else if (token.type === "list") {
      const firstItemToken = token.items[0].tokens[0];

      if (
        firstItemToken &&
        firstItemToken.type === "text" &&
        firstItemToken.tokens.length === 1 &&
        firstItemToken.tokens[0].type === "image"
      ) {
        const { raw, text, tokens } = firstItemToken;
        result.push({ type: "paragraph", raw, text, tokens });
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return result.slice(0, 2);
}

function escapeKaomoji(str) {
  return str.replace(/¯\\_\(ツ\)_\/¯/g, "¯\\\\\\_(ツ)\\_/¯");
}

const tokenizer = new marked.Tokenizer();
const ogRefLinkTokenizer = tokenizer.reflink.bind(tokenizer);

function getMarkedOptions(postId) {
  tokenizer.reflink = function (src, links) {
    let footnoteIndex = 1;

    for (const linkId in links) {
      if (!linkId.startsWith(FOOTNOTE_MARKER)) {
        continue;
      }

      if (links[linkId].isFootnote) {
        continue;
      }

      const footnoteText = footnoteIndex + "";
      const footnoteId = `${postId}:${linkId.slice(1).replace(/\|/g, "-")}`;

      links[linkId].isFootnote = true;
      links[linkId].href = `${footnoteText}|${footnoteId}`; // encoded for renderer.link
      links[linkId].footnoteId = footnoteId;
      links[linkId].footnoteText = footnoteText;
      footnoteIndex++;
    }

    return ogRefLinkTokenizer(src, links);
  };

  return {
    gfm: true,
    smartypants: false,
    renderer: renderer,
    tokenizer: tokenizer,
    langPrefix: "language-",
    highlight: function (code, lang) {
      return require("highlight.js").highlightAuto(
        code,
        lang ? [lang] : undefined
      ).value;
    },
    baseUrl: process.env.BLOG_BASE_URL || null,
  };
}

function generateFootnotes(links) {
  let result = `<div class="footnotes"><hr/><ol>`;

  for (const linkId in links) {
    if (!links[linkId].footnoteId) {
      continue;
    }

    const footnoteId = links[linkId].footnoteId;
    const text = marked(
      links[linkId].title.trim() +
        `&nbsp;<a href="#rfn:${footnoteId}" rev="footnote">&#8617;</a>`
    );
    result += `<li id="fn:${footnoteId}" tabindex="-1">${text}</li>`;
  }

  result += "</ol></div>";

  return result;
}

async function prepare(post, embedsLoader) {
  post.text = escapeKaomoji(post.text);

  const markedOptions = getMarkedOptions(post.id);

  const tokens = marked.lexer(post.text, markedOptions);
  const assignLinks = (ts) => {
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
    title: null,
  };

  const opengraph = {
    url: post.url,
    title: title,
    description: null,
    image: null,
  };

  if (header1Token) {
    const headerPrefix = "#".repeat(header1Token.depth);
    htmlTitle = marked.parse(
      `${headerPrefix} [${header1Token.text}](${post.url})`,
      markedOptions
    );

    htmlTitle = await embedsLoader.load(htmlTitle);

    rss.title = title = cheerio.load(htmlTitle).text().trim();

    const tokensWithoutTitle = tokens.slice(1);
    html = marked.parser(assignLinks([...tokensWithoutTitle]), markedOptions);

    if (Object.values(tokens.links).some((t) => t.isFootnote)) {
      html = html + generateFootnotes(tokens.links);
    }

    html = await embedsLoader.load(html);

    const teaserTokens = assignLinks([
      ...getTeaserTokens(tokensWithoutTitle, { url: post.url }),
    ]);

    let teaser = marked.parser(teaserTokens, markedOptions);

    teaser = await embedsLoader.load(teaser);

    const parsedTeaser = teaser && cheerio.load(teaser);
    opengraph.image =
      parsedTeaser &&
      (parsedTeaser("img").attr("src") ||
        parsedTeaser("[poster]").attr("poster"));
    opengraph.title = title.trim();

    if (tokens.length > 5) {
      const wordMatches = cheerio(html).text().match(WORD_REGEX);

      const wordCount = wordMatches ? wordMatches.length : 0;

      if (wordCount > 200) {
        longread = {
          title: htmlTitle,
          more: pluralize(
            wordCount,
            `${wordCount} слово`,
            `${wordCount} слова`,
            `${wordCount} слов`
          ),
        };

        longread.teaser =
          teaser +
          `\n<a href="${post.url}" class="more">${longread.more} &rarr;</a>`;
      }
    }

    const description =
      teaser &&
      marked
        .parser(teaserTokens, {
          ...markedOptions,
          renderer: textRenderer,
        })
        .trim();

    opengraph.description = description || (longread && longread.more) || null;
  } else {
    html = marked.parser(tokens, markedOptions);
    if (Object.values(tokens.links).some((t) => t.isFootnote)) {
      html = html + generateFootnotes(tokens.links);
    }
    rss.html = html = await embedsLoader.load(html);
  }

  let status;
  if (post.draft) {
    status = "draft";
  } else if (post.internal) {
    status = "internal";
  } else if (post.private) {
    status = "private";
  } else if (post.public) {
    status = "public";
  }

  return {
    id: post.id,
    slug: post.slug,
    draft: post.draft,
    internal: post.internal,
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
      : null,
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
      url: url.resolve(baseUrl, "/rss.xml"),
    },
    static: {
      favicon: {
        ico: url.resolve(baseUrl, "/favicon.ico"),
        png: url.resolve(baseUrl, "/favicon.png"),
        svg: url.resolve(baseUrl, "/favicon.svg"),
      },
      "mask-icon": {
        svg: url.resolve(baseUrl, "/mask-icon.svg"),
      },
    },
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

const SQLITE_ICU_PATH = path.resolve(__dirname, "sqlite-icu", "libicu.so");
async function loadIcu(db) {
  await db.loadExtension(SQLITE_ICU_PATH);
  return db;
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
  getPostUrl,
  loadIcu,
  embedCallback,
  writeFileWithGzip,
  unlinkFileWithGzip,
};
