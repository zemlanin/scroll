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
const ogCode = renderer.code.bind(renderer);

function decodeAttrs(text) {
  return (
    text &&
    text
      .replace(/&apos;/g, `'`)
      .replace(/&quot;/g, `"`)
      .replace(
        /((src|href|poster)=['"]?)\/?media\//g,
        `$1${process.env.BLOG_BASE_URL || ""}/media/`
      )
  );
}

function prefixOwnMedia(href) {
  if (process.env.BLOG_BASE_URL && href.startsWith("/media/")) {
    return process.env.BLOG_BASE_URL + href;
  } else if (process.env.BLOG_BASE_URL && href.startsWith("media/")) {
    return process.env.BLOG_BASE_URL + "/" + href;
  } else if (href.startsWith("media/")) {
    return "/" + href;
  }

  return href;
}

function localEmbed(embed) {
  const href = prefixOwnMedia(embed.href);

  const mimeObj = getMimeObj(href);
  const hrefIsDataURI = href.startsWith("data:text/html;base64");
  const hrefIsOwnMedia = isOwnMedia(href);

  if ((hrefIsOwnMedia && mimeObj.video) || embed.video) {
    let { attrs } = embed.video || {};

    if (!attrs) {
      attrs = "";

      const { gifv, poster } = embed.video || {};

      if (poster) {
        attrs += `poster="${prefixOwnMedia(poster)}" `;
      }

      if (embed.title) {
        attrs += `title="${embed.title
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}" `;
      }

      const isOwnGIFV = hrefIsOwnMedia && href.indexOf("/gifv.mp4") > -1;

      if (gifv || isOwnGIFV) {
        attrs += `autoplay muted loop `;
      } else {
        attrs += `controls preload="none" `;
      }
    }

    return `<video playsinline src="${href}" ${attrs}></video>`;
  }

  if ((hrefIsOwnMedia && mimeObj.pdf) || embed.pdf) {
    const frameSrc = `https://drive.google.com/viewerng/viewer?pid=explorer&efh=false&a=v&chrome=false&embedded=true&url=${encodeURIComponent(
      href
    )}`;

    if (embed.pdf && embed.pdf.poster) {
      const imgSrc = prefixOwnMedia(embed.pdf.poster);
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

  if (hrefIsDataURI || embed.data) {
    const frameSrc = href;
    let imgSrc = null;

    if (embed.data && embed.data.poster) {
      imgSrc = prefixOwnMedia(embed.data.poster);
    } else {
      let lines = [`<tspan x="0" dy="12">data:text/html</tspan>`].concat(
        frameSrc
          .slice("data:text/html;base64,".length)
          .split(/(.{25})/)
          .filter(Boolean)
          .slice(0, 6)
          .map((line) => `<tspan x="0" dy="12">${line}</tspan>`)
      );

      if (embed.title) {
        lines = [
          ...lines.slice(0, 3),
          `<tspan x="80" dy="12" fill="#00a500" text-anchor="middle">${embed.title
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</tspan>`,
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

    return `<a class="future-frame" href="${frameSrc}" data-background="#fff">
      <img src="${imgSrc}">
    </a>`;
  }

  if (hrefIsOwnMedia && mimeObj.text) {
    return `<iframe src="${href}" width="640" height="360" frameborder="0" loading="lazy"></iframe>`;
  }

  return `<x-embed>${JSON.stringify({ href })}</x-embed>`;
}

function getAttr(rawAttrs, attr) {
  const attrStart = rawAttrs.indexOf(attr + "=");
  if (attrStart === -1) {
    return;
  }

  let valueStart = attrStart + attr.length + 1;
  let valueEnd;

  if (rawAttrs[valueStart] === `"`) {
    valueStart += 1;
    valueEnd = rawAttrs.indexOf(`"`, valueStart);
  } else if (rawAttrs[valueStart] === `'`) {
    valueStart += 1;
    valueEnd = rawAttrs.indexOf(`'`, valueStart);
  } else {
    valueEnd = rawAttrs.indexOf(` `, valueStart);
  }

  return rawAttrs
    .slice(valueStart, valueEnd === -1 ? undefined : valueEnd)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function embedCallback(href, title, text) {
  href = prefixOwnMedia(href);

  const mimeObj = getMimeObj(href);
  const hrefIsDataURI = href.startsWith("data:text/html;base64");
  const hrefIsOwnMedia = isOwnMedia(href);

  if (
    (hrefIsOwnMedia || (text && text.indexOf("poster=") > -1)) &&
    mimeObj.video
  ) {
    const attrs = decodeAttrs(text);

    return localEmbed({
      href,
      title: getAttr(attrs, "title"),
      video: {
        gifv: !!attrs.match(/(^|\s+)gifv($|\s+)/g),
        poster: getAttr(attrs, "poster"),
      },
    });
  }

  if (hrefIsOwnMedia && mimeObj.pdf) {
    const attrs = text ? decodeAttrs(text) : "";

    return localEmbed({
      href,
      pdf: {
        poster: getAttr(attrs, "poster"),
      },
    });
  }

  if (hrefIsDataURI) {
    const attrs = text ? decodeAttrs(text) : "";

    const poster = getAttr(attrs, "poster");

    return localEmbed({
      href,
      title: poster ? "" : text,
      data: {
        poster: poster,
      },
    });
  }

  if (!hrefIsOwnMedia && !mimeObj.image) {
    return localEmbed({ href });
  }

  return ogImage(href, title, text).replace(/(\/?>)$/, ' loading="lazy" $1');
}

renderer.image = embedCallback;
renderer.code = function (code, infostring, escaped) {
  if (infostring === "embed") {
    const embeds = code
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => (l.startsWith("{") ? JSON.parse(l) : { href: l }));

    if (embeds.length === 0) {
      return "";
    }

    const embedElements = embeds.map((e) => localEmbed(e));

    if (embedElements.length === 1) {
      return `<p>${embedElements[0]}</p>`;
    }

    const body = embedElements.map((el) => `<li>${el}</li>`).join("\n");

    return `<ul data-gallery style="list-style:none;padding:0">\n${body}</ul>\n`;
  }

  if (infostring === "embed-html") {
    const $ = cheerio.load(code);

    const href = `data:text/html;base64,${Buffer.from(code).toString(
      "base64"
    )}`;
    const title = $("title").text();
    const poster = $('meta[property="og:image"]').attr("content");

    return `<p>${localEmbed({ href, title, data: { poster } })}</p>`;
  }

  return ogCode(code, infostring, escaped);
};

renderer.link = function (href, title, text) {
  if (text && text.startsWith(FOOTNOTE_MARKER)) {
    return "";
  }

  href = prefixOwnMedia(href);

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

const markedOptions = {
  gfm: true,
  smartypants: false,
  renderer: renderer,
  langPrefix: "language-",
  highlight: function (code, lang) {
    return require("highlight.js").highlightAuto(
      code,
      lang ? [lang] : undefined
    ).value;
  },
  baseUrl: process.env.BLOG_BASE_URL || null,
};

function sealTeaser(teaserParagraphs) {
  teaserParagraphs.push("", "");
}

function walkWithTeaser(token, postUrl, teaserParagraphs) {
  if (token.type === "heading") {
    sealTeaser(teaserParagraphs);
    return;
  }

  if (token.type === "paragraph") {
    if (token.tokens.length !== 1) {
      return;
    }

    const paragraphContent = token.tokens[0];

    if (paragraphContent.type === "image") {
      teaserParagraphs.push(marked.parser([token], markedOptions));
      return;
    }

    if (
      paragraphContent.type === "link" &&
      paragraphContent.tokens &&
      paragraphContent.tokens.length === 1 &&
      paragraphContent.tokens[0].type === "image"
    ) {
      teaserParagraphs.push(marked.parser([token], markedOptions));
      return;
    }

    if (paragraphContent.type === "em") {
      teaserParagraphs.push(marked.parser([token], markedOptions));
      return;
    }

    sealTeaser(teaserParagraphs);
    return;
  }

  if (token.type === "list") {
    const tokenIsGalleryList = token.items.every((listitem) => {
      const contentfulTokens = listitem.tokens.filter(
        (t) => t.type !== "space"
      );
      const firstToken = contentfulTokens[0];

      return (
        contentfulTokens.length === 1 &&
        firstToken.type === "text" &&
        firstToken.tokens.length === 1 &&
        firstToken.tokens[0].type === "image"
      );
    });

    if (tokenIsGalleryList) {
      teaserParagraphs.push(marked.parser([token], markedOptions));
      return;
    }

    sealTeaser(teaserParagraphs);
    return;
  }
}

function escapeKaomoji(str) {
  return str.replace(/¯\\_\(ツ\)_\/¯/g, "¯\\\\\\_(ツ)\\_/¯");
}

function walkWithoutFootnotes(token) {
  if (token.tokens && token.tokens.length) {
    token.tokens = token.tokens.reduce((acc, t) => {
      if (t.type === "link" && t.text.startsWith(FOOTNOTE_MARKER)) {
        return acc;
      }

      acc.push(t);
      return acc;
    }, []);
  }
}

function hideToken(token) {
  token.type = "space";
  token.text = "";
  token.raw = "";
  token.tokens = null;
}

function walkWithFootnotes(token, postId, footnotes) {
  if (
    token.type === "code" &&
    token.codeBlockStyle === "indented" &&
    footnotes.checkForMultilineFootnote
  ) {
    const footnoteId = footnotes.checkForMultilineFootnote;
    const footnoteToUpdate = footnotes.find((fn) => fn.id === footnoteId);

    const text = footnoteToUpdate.multilineStart + "\n\n" + token.text.trim();

    const footnoteHTML = marked(
      text + `&nbsp;<a href="#rfn:${footnoteId}" rev="footnote">&#8617;</a>`
    );

    footnoteToUpdate.multilineStart = "";
    footnoteToUpdate.html = `<li id="fn:${footnoteId}" tabindex="-1">${footnoteHTML}</li>`;

    hideToken(token);

    footnotes.checkForMultilineFootnote = null;
  } else if (token.type !== "space") {
    footnotes.checkForMultilineFootnote = null;
  }

  if (
    token.type === "paragraph" &&
    token.raw
      .split("\n")
      .every((line) => line.startsWith("[" + FOOTNOTE_MARKER))
  ) {
    for (const line of token.raw.split("\n").filter(Boolean)) {
      const [match, incompleteId] = line.match(/\[\^([^\]]+)\]: /);
      const footnoteId = `${postId}:${incompleteId}`;
      const footnoteToUpdate = footnotes.find((fn) => fn.id === footnoteId);

      const text = line.slice(match.length).trim();

      const footnoteHTML = marked(
        text + `&nbsp;<a href="#rfn:${footnoteId}" rev="footnote">&#8617;</a>`
      );

      footnoteToUpdate.multilineStart = text;
      footnoteToUpdate.html = `<li id="fn:${footnoteId}" tabindex="-1">${footnoteHTML}</li>`;
      footnotes.checkForMultilineFootnote = footnoteId;
    }

    hideToken(token);
  } else if (token.tokens && token.tokens.length) {
    token.tokens = token.tokens.reduce((acc, t, i) => {
      if (t.type === "link" && t.text.startsWith(FOOTNOTE_MARKER)) {
        const footnoteId = `${postId}:${t.text.slice(1)}`;
        const footnoteHTML = marked(
          (t.title || t.href).trim() +
            `&nbsp;<a href="#rfn:${footnoteId}" rev="footnote">&#8617;</a>`
        );
        footnotes.push({
          index: footnotes.length,
          id: footnoteId,
          html: `<li id="fn:${footnoteId}" tabindex="-1">${footnoteHTML}</li>`,
        });

        const anchor = `<sup><a href="#fn:${footnoteId}" id="rfn:${footnoteId}" rel="footnote">${footnotes.length}</a></sup>`;

        acc.push({
          type: "html",
          raw: anchor,
          inLink: true,
          inRawBlock: false,
          text: anchor,
        });
      } else if (
        t.type === "text" &&
        t.text === "[" &&
        token.tokens[i + 1].text.startsWith(FOOTNOTE_MARKER)
      ) {
        const nextToken = token.tokens[i + 1];
        const restOfFootnote = nextToken.text.slice(
          1,
          nextToken.text.indexOf("]")
        );

        const footnoteId = restOfFootnote.match(/^[a-zA-Z0-9_-]+$/i)
          ? `${postId}:${restOfFootnote}`
          : `${postId}:${footnotes.length + 1}`;

        const footnoteHTML = marked(
          restOfFootnote.trim() +
            `&nbsp;<a href="#rfn:${footnoteId}" rev="footnote">&#8617;</a>`
        );

        footnotes.push({
          index: footnotes.length,
          id: footnoteId,
          html: `<li id="fn:${footnoteId}" tabindex="-1">${footnoteHTML}</li>`,
        });

        const anchor = `<sup><a href="#fn:${footnoteId}" id="rfn:${footnoteId}" rel="footnote">${footnotes.length}</a></sup>`;

        acc.push({
          type: "html",
          raw: anchor,
          inLink: true,
          inRawBlock: false,
          text: anchor,
        });

        nextToken.text = nextToken.text.slice(restOfFootnote.length + 2); // `"] ".length === 2`
        nextToken.raw = nextToken.raw.slice(restOfFootnote.length + 2); // `"] ".length === 2`
      } else {
        acc.push(t);
      }

      return acc;
    }, []);
  }
}

function byIndex(a, b) {
  return a.index - b.index;
}

async function prepare(post, embedsLoader) {
  post.text = escapeKaomoji(post.text);

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

  const startsWithHeading = post.text && post.text.match(/^#+ [^\r\n]+/);

  if (startsWithHeading) {
    const headingLength = startsWithHeading[0].length;

    htmlTitle = marked.parse(
      post.text
        .slice(0, headingLength)
        .replace(/^(#+) (.*)$/, `$1 [$2](${post.url})`),
      {
        ...markedOptions,
        walkTokens: walkWithoutFootnotes,
      }
    );

    htmlTitle = await embedsLoader.load(htmlTitle);

    rss.title = title = cheerio.load(htmlTitle).text().trim();

    const textWithoutTitle = post.text.slice(headingLength);
    let numberOfParagraphs = 0;
    const footnotes = [];
    const teaserParagraphs = [];

    html = marked.parse(textWithoutTitle, {
      ...markedOptions,
      walkTokens(token) {
        walkWithFootnotes(token, post.id, footnotes);

        if (numberOfParagraphs < 2 && teaserParagraphs.length < 2) {
          walkWithTeaser(token, post.url, teaserParagraphs);
        }

        if (token.type === "paragraph") {
          numberOfParagraphs++;
        }
      },
    });

    if (footnotes.length) {
      footnotes.sort(byIndex);
      html =
        html +
        `<div class="footnotes"><hr><ol>${footnotes
          .map((f) => f.html)
          .join("\n")}</ol></div>`;
    }

    html = await embedsLoader.load(html);

    const teaser = await embedsLoader.load(teaserParagraphs.join("\n"));

    const parsedTeaser = teaser && cheerio.load(teaser);
    opengraph.image = parsedTeaser
      ? parsedTeaser("img").attr("src") ||
        parsedTeaser("[poster]").attr("poster") ||
        null
      : null;
    opengraph.title = title.trim();

    if (numberOfParagraphs > 3) {
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
      (parsedTeaser &&
        parsedTeaser("em").text() &&
        parsedTeaser("em").text().trim()) ||
      (longread && longread.more);

    opengraph.description = description || (longread && longread.more) || null;
  } else {
    const footnotes = [];
    html = marked.parse(post.text, {
      ...markedOptions,
      walkTokens(token) {
        walkWithFootnotes(token, post.id, footnotes);
      },
    });
    if (footnotes.length) {
      html =
        html +
        `<div class="footnotes"><hr><ol>${footnotes
          .map((f) => f.html)
          .join("\n")}</ol></div>`;
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
    indieweb: {
      micropub: url.resolve(baseUrl, "/backstage/micropub"),
      authorization_endpoint: url.resolve(
        baseUrl,
        "/backstage/indielogin/auth"
      ),
      token_endpoint: url.resolve(baseUrl, "/backstage/indielogin/token"),
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
