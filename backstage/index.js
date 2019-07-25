const url = require("url");

const { authed, logout, sendToAuthProvider } = require("./auth.js");
const { render } = require("./templates/index.js");
const { prepare: commonPrepare } = require("../common.js");

const PAGE_SIZE = 10;

async function prepare(post, options) {
  const urls = {
    edit: url.resolve(options.baseUrl, `/backstage/edit/?id=${post.id}`),
    preview: url.resolve(options.baseUrl, `/backstage/preview/?id=${post.id}`),
    permalink: url.resolve(options.baseUrl, `/${post.slug || post.id}.html`)
  };

  return {
    ...(await commonPrepare(post)),
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

  const db = await req.db();
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
      ORDER BY datetime(created) DESC, id DESC
      LIMIT ?2 OFFSET ?1
    `,
    { 1: offset, 2: PAGE_SIZE + 1 }
  );

  const morePosts = posts.length > PAGE_SIZE;
  const suggestion = await getSuggestion(db, req);

  return render("list.mustache", {
    user: user,
    posts: await Promise.all(
      posts.slice(0, PAGE_SIZE).map(p =>
        prepare(p, {
          baseUrl: req.absolute
        })
      )
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
