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

  let qWhereValue = "";
  if (query.q) {
    try {
      qWhereValue = decodeURIComponent(query.q)
        .trim()
        .toLowerCase();
    } catch (e) {
      //
    }
  }

  let qWhereCondition = ``;

  if (qWhereValue) {
    if (!(qWhereValue === "private" || qWhereValue === "public")) {
      qWhereCondition += ` AND (instr(id, $query) OR instr(lower(text), $query))`;
    }

    if (qWhereValue === "private" || qWhereValue.startsWith("private ")) {
      qWhereCondition += ` AND private`;
      qWhereValue = qWhereValue.slice("private".length).trim();
    } else if (qWhereValue === "public" || qWhereValue.startsWith("public ")) {
      qWhereCondition += ` AND (NOT draft AND NOT private)`;
      qWhereValue = qWhereValue.slice("public".length).trim();
    }
  }

  const draft = offset
    ? []
    : await db.all(
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
        WHERE draft ${qWhereCondition}
        ORDER BY datetime(created) DESC, id DESC
      `,
      {
        ...(qWhereValue ? { $query: qWhereValue } : {})
      }
    );
  }

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
      WHERE NOT draft ${qWhereCondition}
      ORDER BY datetime(created) DESC, id DESC
      LIMIT $limit OFFSET $offset
    `,
    {
      $offset: offset,
      $limit: PAGE_SIZE + 1,
      ...(qWhereValue ? { $query: qWhereValue } : {})
    }
  );

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
        ? url.resolve(
            req.absolute,
            `/backstage/?offset=${offset + PAGE_SIZE}${
              query.q ? "&q=" + query.q : ""
            }`
          )
        : null,
      newest:
        offset > PAGE_SIZE
          ? url.resolve(
              req.absolute,
              `/backstage/${query.q ? "?q=" + query.q : ""}`
            )
          : null,
      newer: +offset
        ? url.resolve(
            req.absolute,
            `/backstage/?offset=${Math.max(offset - PAGE_SIZE, 0)}${
              query.q ? "&q=" + query.q : ""
            }`
          )
        : null
    }
  });
};
