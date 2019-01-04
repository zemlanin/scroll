const url = require("url");

const { authed, logout, sendToAuthProvider } = require("./auth.js");
const { render } = require("./templates/index.js");
const { POSTS_DB, renderer } = require("../common.js");
const marked = require("marked");
const sqlite = require("sqlite");
const cheerio = require("cheerio");

const PAGE_SIZE = 10;

const MARKED_END_TOKENS_MAP = {
  list_start: "list_end",
  list_item_start: "list_item_start",
  loose_item_start: "list_item_end",
  blockquote_start: "blockquote_end"
};

function prepare(post, options) {
  let tokens = marked.lexer(post.text);

  let title = post.slug || post.id;
  const urls = {
    edit: url.resolve(options.baseUrl, `/backstage/edit/?id=${post.id}`),
    preview: url.resolve(options.baseUrl, `/backstage/preview/?id=${post.id}`),
    permalink: url.resolve(options.baseUrl, `/${post.slug || post.id}.html`)
  };

  const header1Token = tokens.find(t => t.type === "heading" && t.text);

  if (header1Token) {
    const headerUrl =
      post.public || post.private ? urls.permalink : urls.preview;
    title = cheerio.load(marked(header1Token.text)).text();
    post.text = post.text.replace(
      header1Token.text,
      `[${header1Token.text}](${headerUrl})`
    );
  }

  post.text = post.text.replace(/¯\\_\(ツ\)_\/¯/g, "¯\\\\\\_(ツ)\\_/¯");

  tokens = marked.lexer(post.text);
  const shortTokens = [];
  let paragraphsCounter = 0;
  const closingTokensStack = [];
  for (const token of tokens) {
    shortTokens.push(token);

    if (token.type === "paragraph") {
      paragraphsCounter = paragraphsCounter + 1;
    }

    if (MARKED_END_TOKENS_MAP[token.type]) {
      closingTokensStack.unshift(MARKED_END_TOKENS_MAP[token.type]);
    }

    if (closingTokensStack.length && closingTokensStack[0] === token.type) {
      closingTokensStack.shift();
    }

    if (paragraphsCounter >= 3 && !closingTokensStack.length) {
      break;
    }
  }
  shortTokens.links = tokens.links;

  return {
    ...post,
    title: title,
    short: marked.parser(shortTokens, {
      baseUrl: options.baseUrl,
      gfm: true,
      smartypants: false,
      renderer: renderer
    }),
    urls: urls
  };
}

async function getSuggestion(db, req) {
  const referer = req.headers.referer;
  if (!referer) {
    return;
  }

  const host = req.headers.host;
  const idOrSlugMatch = referer.match(
    `^https?://${host.replace(".", "\\.")}/([a-zA-Z0-9_-]+)(.html)?$`
  );
  if (idOrSlugMatch) {
    const idOrSlug = idOrSlugMatch[1];
    const suggestionPost = await db.get(
      `SELECT id, slug FROM posts WHERE id = ?1 OR slug = ?1 LIMIT 1`,
      { 1: idOrSlug }
    );

    if (!suggestionPost) {
      return;
    }

    return {
      text: `edit ${idOrSlug}`,
      url: `/backstage/edit/?id=${suggestionPost.id}`
    };
  }
}

module.exports = async (req, res) => {
  const query = url.parse(req.url, true).query;

  if (query.logout) {
    logout(res);
    res.statusCode = 303;
    res.setHeader("Location", "/");
    return;
  }

  const user = authed(req, res);

  if (!user) {
    return sendToAuthProvider(req, res);
  }

  const db = await sqlite.open(POSTS_DB);
  const offset = +query.offset || 0;
  const posts = await db.all(
    `
      SELECT
        id,
        slug,
        draft,
        private,
        (NOT draft AND NOT private) public,
        text,
        strftime('%s000', created) created,
        strftime('%s000', modified) modified
      FROM posts
      ORDER BY created DESC
      LIMIT ?2 OFFSET ?1
    `,
    { 1: offset, 2: PAGE_SIZE + 1 }
  );

  const morePosts = posts.length > PAGE_SIZE;
  const suggestion = await getSuggestion(db, req);

  return render("list.mustache", {
    user: user,
    posts: posts.slice(0, PAGE_SIZE).map(p =>
      prepare(p, {
        baseUrl: req.absolute
      })
    ),
    suggestion: suggestion,
    gauges: {
      id: process.env.GAUGES_ID
    },
    urls: {
      logout: url.resolve(req.absolute, "/backstage/?logout=1"),
      jwt: url.resolve(req.absolute, "/backstage/jwt"),
      older: morePosts
        ? url.resolve(req.absolute, `/backstage/?offset=${offset + PAGE_SIZE}`)
        : null,
      newer: +offset
        ? url.resolve(
            req.absolute,
            `/backstage/?offset=${Math.max(offset - PAGE_SIZE, 0)}`
          )
        : null
    }
  });
};
