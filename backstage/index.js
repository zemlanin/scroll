const url = require("url");
const cookie = require("cookie");

const { authed, logout, sendToAuthProvider } = require("./auth.js");
const { render } = require("./render.js");
const { prepare: commonPrepare } = require("../common.js");
const EmbedsLoader = require("../embeds-loader.js");

const PAGE_SIZE = 10;

async function prepare(post, options) {
  const urls = {
    edit: url.resolve(options.baseUrl, `/backstage/edit/?id=${post.id}`),
    preview: url.resolve(options.baseUrl, `/backstage/preview/?id=${post.id}`),
    permalink: url.resolve(options.baseUrl, `/${post.slug || post.id}.html`)
  };

  return {
    ...(await commonPrepare(post, options.embedsLoader)),
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

  let posts;
  let drafts;

  if (offset) {
    drafts = [];
  } else if (query.q) {
    drafts = await db.all(
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
        WHERE (instr(id, ?3) OR instr(lower(text), ?3))
          AND draft
        ORDER BY datetime(created) DESC, id DESC
      `,
      {
        3: decodeURIComponent(query.q).toLowerCase()
      }
    );
  } else {
    drafts = await db.all(
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
        WHERE draft
        ORDER BY datetime(created) DESC, id DESC
      `,
      {}
    );
  }

  if (query.q) {
    posts = await db.all(
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
        WHERE (instr(id, ?3) OR instr(lower(text), ?3))
          AND NOT draft
        ORDER BY datetime(created) DESC, id DESC
        LIMIT ?2 OFFSET ?1
      `,
      {
        1: offset,
        2: PAGE_SIZE + 1,
        3: decodeURIComponent(query.q).toLowerCase()
      }
    );
  } else {
    posts = await db.all(
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
        WHERE NOT draft
        ORDER BY datetime(created) DESC, id DESC
        LIMIT ?2 OFFSET ?1
      `,
      { 1: offset, 2: PAGE_SIZE + 1 }
    );
  }

  const morePosts = posts.length > PAGE_SIZE;
  const suggestion = await getSuggestion(db, req);
  const embedsLoader = new EmbedsLoader(db);

  return render("list.mustache", {
    user: user,
    q: query.q || "",
    drafts: await Promise.all(
      drafts
        .map(p =>
          p.text.startsWith("#")
            ? { ...p, text: p.text.trim().split("\n")[0] }
            : p
        )
        .map(p =>
          prepare(p, {
            baseUrl: req.absolute,
            embedsLoader: embedsLoader
          })
        )
    ),
    posts: await Promise.all(
      posts.slice(0, PAGE_SIZE).map(p =>
        prepare(p, {
          baseUrl: req.absolute,
          embedsLoader: embedsLoader
        })
      )
    ),
    suggestion: suggestion,
    gauges: {
      id: process.env.GAUGES_ID
    },
    devMode: {
      canEnter: process.env.NODE_ENV === "production",
      canExit:
        process.env.NODE_ENV === "development" &&
        cookie.parse(req.headers.cookie || "").dev
    },
    urls: {
      logout: url.resolve(req.absolute, "/backstage/?logout=1"),
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
