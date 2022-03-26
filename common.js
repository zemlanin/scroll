const fs = require("fs");
const url = require("url");
const path = require("path");
const zlib = require("zlib");
const { promisify } = require("util");

const y = require("yassium");
const mime = require("mime");
const { marked } = require("marked");
const { customAlphabet } = require("nanoid");
const cheerio = require("cheerio");
const faFilePdf = require("@fortawesome/free-solid-svg-icons/faFilePdf.js");

const { getStaticsObject } = require("./render.js");

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
const RSS_SIZE = 20;
const BLOG_TITLE = "zemlan.in";
const PORT = process.env.PORT || 8000;
const BLOG_BASE_URL = process.env.BLOG_BASE_URL || ".";
const DIST = path.resolve(__dirname, process.env.DIST || "dist");
const POSTS_DB = path.resolve(__dirname, process.env.POSTS_DB || "posts.db");
const SESSIONS_DB = path.resolve(
  __dirname,
  process.env.SESSIONS_DB || "sessions.db"
);
const LINKLIST_SOURCE_FEED = process.env.LINKLIST_SOURCE_FEED || null;
const FOOTNOTE_MARKER = "^";

const nanoid = {
  link: customAlphabet(
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    10
  ),
  post: customAlphabet(
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    10
  ),
  media: customAlphabet(
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    26
  ),
};

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

function pdfPlaceholder(href) {
  const { width, height, svgPathData } = faFilePdf;
  const iconX = 80 - faFilePdf.width / 20;

  return (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90">
          <defs><style type="text/css">
            text {
              font-size: 4px;
              font-family: "SF Mono", "Menlo-Regular", Consolas, "Andale Mono WT",
                "Andale Mono", "Lucida Console", "Lucida Sans Typewriter",
                "DejaVu Sans Mono", "Bitstream Vera Sans Mono", "Liberation Mono",
                "Nimbus Mono L", Monaco, "Courier New", Courier, monospace;
            }
          </style></defs>
          <rect x="0" y="0" height="90" width="160" fill="white" />
          <svg x="${iconX}" y="10" xmlns="http://www.w3.org/2000/svg" width="${
        width / 10
      }px" height="${height / 10}px" viewBox="0 0 ${width} ${height}">
            <path fill="#00a500" d="${svgPathData}"></path>
          </svg>
          <text x="0" y="0" fill="#888">
            <tspan x="80" dy="80" fill="#00a500" text-anchor="middle">
              ${href
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&apos;")}
            </tspan>
          </text>
        </svg>
      `.replace(/^\s+/gm, "")
    )
  );
}

function localEmbed(embed) {
  const href = prefixOwnMedia(embed.href);

  const mimeObj = getMimeObj(href);
  const hrefIsDataURI = href.startsWith("data:text/html;base64");
  const hrefIsOwnMedia = isOwnMedia(href);

  if ((hrefIsOwnMedia && mimeObj.video) || embed.video) {
    let attrs;

    if (embed.attrs) {
      attrs = embed.attrs;
    } else {
      attrs = "";

      const { gifv, poster, title } = embed;

      if (poster) {
        attrs += `poster="${prefixOwnMedia(poster)}" `;
      }

      if (title) {
        attrs += `title="${title
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&apos;")}" `;
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
    const imgSrc = embed.poster
      ? prefixOwnMedia(embed.poster)
      : pdfPlaceholder(href);

    return `<a class="embedded-pdf" href="${href}">
      <img src="${imgSrc}">
    </a>`;
  }

  if (hrefIsDataURI) {
    const frameSrc = href;
    let imgSrc = null;
    embed.mimetype = "text/html";

    if (embed.poster) {
      imgSrc = prefixOwnMedia(embed.poster);
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
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;")}</tspan>`,
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

      embed.href = frameSrc;
      embed.poster = imgSrc;
    }
  }

  if (hrefIsOwnMedia && mimeObj.text) {
    return `<iframe src="${href}" width="640" height="360" frameborder="0"></iframe>`;
  }

  if (hrefIsOwnMedia && mimeObj.image) {
    return `<img src="${href}" alt="${embed.title || ""}">`;
  }

  return `<x-embed>${JSON.stringify(embed)}</x-embed>`;
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
    .replace(/&quot;/g, `"`)
    .replace(/&apos;/g, `'`)
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
      gifv: !!attrs.match(/(^|\s+)gifv($|\s+)/g),
      poster: getAttr(attrs, "poster"),
    });
  }

  if (hrefIsOwnMedia && mimeObj.pdf) {
    const attrs = text ? decodeAttrs(text) : "";

    return localEmbed({
      href,
      poster: getAttr(attrs, "poster"),
    });
  }

  if (hrefIsDataURI) {
    const attrs = text ? decodeAttrs(text) : "";

    const poster = getAttr(attrs, "poster");

    return localEmbed({
      href,
      title: poster ? "" : text,
      poster: poster,
    });
  }

  if (!hrefIsOwnMedia && !mimeObj.image) {
    return localEmbed({ href });
  }

  return ogImage(href, title, text);
}

renderer.image = embedCallback;
renderer.code = function (code, infostring, escaped) {
  if (infostring === "embed") {
    const embeds = code
      .split("\n")
      .filter(Boolean)
      .reduce((acc, line) => {
        if (line.startsWith("  ") || line.startsWith("- ")) {
          const embed = acc.pop() || {};

          const colonIndex = line.indexOf(":");

          const [key, value] = [
            line.slice(2, colonIndex).trim(),
            line.slice(colonIndex + 1).trim(),
          ];

          embed[key] = value;

          acc.push(embed);
        } else {
          acc.push({ href: line.trim() });
        }

        return acc;
      }, []);

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

    return `<p>${localEmbed({ href, title, poster })}</p>`;
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

const WORD_REGEX =
  /[a-zA-Z0-9_\u0392-\u03c9\u0400-\u04FF]+|[\u4E00-\u9FFF\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\uac00-\ud7af\u0400-\u04FF]+|[\u00E4\u00C4\u00E5\u00C5\u00F6\u00D6]+|\w+/g;

const WORD_COUNT_FORMS = {
  en: {
    _rules: new Intl.PluralRules("en"),
    one: y`${y.number} word`,
    other: y`${y.number} words`,
  },
  ru: {
    _rules: new Intl.PluralRules("ru"),
    one: y`${y.number} слово`,
    few: y`${y.number} слова`,
    many: y`${y.number} слов`,
    other: y`${y.number} слов`,
  },
  uk: {
    _rules: new Intl.PluralRules("uk"),
    one: y`${y.number} слово`,
    few: y`${y.number} слова`,
    many: y`${y.number} слів`,
    other: y`${y.number} слів`,
  },
};

function wordCountPhrase(lang, number) {
  const { _rules, ...forms } = WORD_COUNT_FORMS[lang] || WORD_COUNT_FORMS.ru;

  const form = _rules.select(number);

  return (forms[form] || forms.other)({ number });
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
      const tokenWithoutFootnotes = {
        ...token,
        tokens: [{ ...paragraphContent, tokens: [...paragraphContent.tokens] }],
      };
      walkWithoutFootnotes(tokenWithoutFootnotes.tokens[0]);
      teaserParagraphs.push(
        marked.parser([tokenWithoutFootnotes], markedOptions)
      );

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

  if (
    token.type === "code" &&
    (token.lang === "embed" || token.lang === "embed-html")
  ) {
    teaserParagraphs.push(marked.parser([token], markedOptions));
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

      if (
        !t.tokens &&
        t.type === "text" &&
        t.text.includes("[" + FOOTNOTE_MARKER)
      ) {
        acc.push({
          ...t,
          raw: t.raw.replace(/\[\^[^\]]+\]/g, ""),
          text: t.text.replace(/\[\^[^\]]+\]/g, ""),
        });
      } else {
        acc.push(t);
      }

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
      text +
        `&nbsp;<a href="#rfn:${footnoteId}" rev="footnote">&#8617;&#xfe0e;</a>`,
      markedOptions
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
      .filter(Boolean)
      .every((line) => line.startsWith("[" + FOOTNOTE_MARKER))
  ) {
    for (const line of token.raw.split("\n").filter(Boolean)) {
      const [match, incompleteId] = line.match(/\[\^([^\]]+)\]: /);
      const footnoteId = `${postId}:${incompleteId}`;
      const footnoteToUpdate = footnotes.find((fn) => fn.id === footnoteId);

      const text = line.slice(match.length).trim();

      const footnoteHTML = marked(
        text +
          `&nbsp;<a href="#rfn:${footnoteId}" rev="footnote">&#8617;&#xfe0e;</a>`,
        markedOptions
      );

      footnoteToUpdate.multilineStart = text;
      footnoteToUpdate.html = `<li id="fn:${footnoteId}" tabindex="-1">${footnoteHTML}</li>`;
      footnotes.checkForMultilineFootnote = footnoteId;
    }

    hideToken(token);
  } else if (token.tokens && token.tokens.length) {
    token.tokens = token.tokens.reduce((acc, t) => {
      if (t.type === "link" && t.text.startsWith(FOOTNOTE_MARKER)) {
        const footnoteId = `${postId}:${t.text.slice(1)}`;
        const footnoteHTML = marked(
          (t.title || t.href).trim() +
            `&nbsp;<a href="#rfn:${footnoteId}" rev="footnote">&#8617;&#xfe0e;</a>`,
          markedOptions
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
        !t.tokens &&
        t.type === "text" &&
        t.text.includes("[" + FOOTNOTE_MARKER)
      ) {
        let cursor = 0;

        while (cursor < t.text.length - 1) {
          const markerIndex = t.text.indexOf("[" + FOOTNOTE_MARKER, cursor);

          if (markerIndex === -1) {
            acc.push({
              ...t,
              text: t.text.slice(cursor),
              raw: t.text.slice(cursor),
            });
            break;
          } else {
            if (cursor < markerIndex) {
              acc.push({
                ...t,
                text: t.text.slice(cursor, markerIndex),
                raw: t.text.slice(cursor, markerIndex),
              });
            }

            cursor = t.text.indexOf("]", markerIndex + 2); // `"[^".length === 2`
            const restOfFootnote = t.text.slice(
              markerIndex + 2, // `"[^".length === 2`
              cursor
            );
            cursor += 1; // `"]".length === 1`

            const footnoteId = restOfFootnote.match(/^[a-zA-Z0-9_-]+$/i)
              ? `${postId}:${restOfFootnote}`
              : `${postId}:${footnotes.length + 1}`;

            const footnoteHTML = marked(
              restOfFootnote.trim() +
                `&nbsp;<a href="#rfn:${footnoteId}" rev="footnote">&#8617;&#xfe0e;</a>`,
              markedOptions
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
          }
        }
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

function getOpengraphLocaleFromLang(lang) {
  switch (lang) {
    case "ru":
      return "ru_RU";
    case "uk":
      return "uk_UA";
    case "en":
      return "en_US";
  }

  return null;
}

async function prepare(post, embedsLoader) {
  post.text = escapeKaomoji(post.text);

  const created = new Date(parseInt(post.created));
  const modified = post.modified ? new Date(parseInt(post.modified)) : null;

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
    locale: getOpengraphLocaleFromLang(post.lang),
    title: title,
    published_time: created.toISOString().replace(/\.\d{3}Z$/, "Z"),
    modified_time: modified
      ? modified.toISOString().replace(/\.\d{3}Z$/, "Z")
      : null,
    description: null,
    image: null,
  };

  const startsWithHeading = post.text && post.text.match(/^#+ [^\r\n]+/);

  if (startsWithHeading && !post.internal) {
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

    rss.html = await embedsLoader.load(html, {
      externalFrames: true,
      maxWidth: 720,
    });
    html = await embedsLoader.load(html);

    const teaser = await embedsLoader.load(teaserParagraphs.join("\n"));

    const parsedTeaser = teaser && cheerio.load(teaser);
    opengraph.image = parsedTeaser
      ? parsedTeaser("img").attr("src") ||
        parsedTeaser("[poster]").attr("poster") ||
        null
      : null;

    if (opengraph.image) {
      opengraph.image = prefixOwnMedia(opengraph.image);
    }
    opengraph.title = title.trim();

    if (numberOfParagraphs > 3) {
      const wordMatches = cheerio.load(html).text().match(WORD_REGEX);

      const wordCount = wordMatches ? wordMatches.length : 0;

      if (wordCount > 200) {
        longread = {
          title: htmlTitle,
          teaser: teaser,
          more: wordCountPhrase(post.lang, wordCount),
        };
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
    rss.html = await embedsLoader.load(html, {
      externalFrames: true,
      maxWidth: 720,
    });
    html = await embedsLoader.load(html);
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
    lang: post.lang,
    text: post.text,
    created: created.toISOString().replace(/\.\d{3}Z$/, "Z"),
    createdDate: created.toISOString().split("T")[0],
    createdUTC: created.toUTCString(),
    modified: modified
      ? modified.toISOString().replace(/\.\d{3}Z$/, "Z")
      : null,
  };
}

async function getBlogObject(baseUrl) {
  if (!baseUrl) {
    baseUrl = BLOG_BASE_URL;
  }

  const statics = await getStaticsObject();
  const lang = "uk";

  return {
    title: BLOG_TITLE,
    url: url.resolve(baseUrl, "/"),
    lang,
    author: {
      name: "Anton Verinov",
      twitter: "zemlanin",
      buymeacoffee: "zemlanin",
    },
    feed: {
      description: BLOG_TITLE,
      url: url.resolve(baseUrl, "/rss.xml"),
    },
    linkblog: {
      lang,
      title: `Linkblog • ${BLOG_TITLE}`,
      url: url.resolve(baseUrl, "/linkblog.html"),
      feed: {
        description: `Linked and Found`,
        url: url.resolve(baseUrl, "/feeds/linkblog.xml"),
      },
    },
    archive: {
      lang,
      url: url.resolve(baseUrl, "/archive.html"),
    },
    static: {
      favicon: {
        ico: url.resolve(baseUrl, statics["/favicon.ico"]),
        png: url.resolve(baseUrl, statics["/favicon.png"]),
        svg: url.resolve(baseUrl, statics["/favicon.svg"]),
      },
      "mask-icon": {
        svg: url.resolve(baseUrl, statics["/mask-icon.svg"]),
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

const getLinkId = () =>
  `link-${new Date().getFullYear()}-${(new Date().getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${nanoid.link()}`;

module.exports = {
  BLOG_TITLE,
  BLOG_BASE_URL,
  DIST,
  PORT,
  POSTS_DB,
  SESSIONS_DB,
  LINKLIST_SOURCE_FEED,
  PAGE_SIZE,
  MINIMUM_INDEX_PAGE_SIZE,
  RSS_SIZE,
  getMimeObj,
  getBlogObject,
  prepare,
  getPostUrl,
  loadIcu,
  embedCallback,
  writeFileWithGzip,
  unlinkFileWithGzip,
  getLinkId,
  nanoid,
  isOwnMedia,
};
