const { getSession, logout, sendToAuthProvider } = require("./auth.js");
const { render } = require("./render.js");
const { prepare: commonPrepare } = require("../common.js");
const EmbedsLoader = require("../embeds-loader.js");

const PAGE_SIZE = 10;

async function prepare(post, options) {
  const stats = getHitsAndVisitors(post);
  const preparedPost = await commonPrepare(post, options.embedsLoader);

  const urls = {
    edit: new URL(`/backstage/edit/?id=${post.id}`, options.baseUrl),
    preview: new URL(`/backstage/preview/?id=${post.id}`, options.baseUrl),
    permalink: preparedPost.url,
  };

  return {
    ...preparedPost,
    urls: urls,
    stats: stats.visitors || stats.hits ? stats : null,
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
      url: `/backstage/edit/?id=${suggestionPost.id}`,
    };
  }
}

let goaccessTTL = new Date(0);
function getHitsAndVisitors(post) {
  const goaccessPath = process.env.GOACCESS_JSON;

  if (!goaccessPath) {
    return {};
  }

  if (goaccessTTL < new Date()) {
    delete require.cache[require.resolve(goaccessPath)];
    goaccessTTL = new Date(+new Date() + 60 * 1000);
  }

  return require(goaccessPath)
    .requests.data.filter((d) => d.method === "GET")
    .filter(
      (d) =>
        d.data === `/${post.id}.html` ||
        d.data === `/${post.id}` ||
        (post.slug &&
          (d.data === `/${post.slug}.html` || d.data === `/${post.slug}`))
    )
    .reduce(
      (acc, d) => ({
        hits: acc.hits + d.hits.count,
        visitors: acc.visitors + d.visitors.count,
      }),
      { hits: 0, visitors: 0 }
    );
}

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, req.absolute);

  if (searchParams.get("logout")) {
    logout(req, res);
    res.statusCode = 303;
    res.setHeader("Location", "/");
    return;
  }

  const session = await getSession(req, res);
  if (!session) {
    return sendToAuthProvider(req, res);
  }

  const db = await req.db();
  const offset = +searchParams.get("offset") || 0;

  let qWhereValue = "";
  const query = searchParams.get("q");
  if (query) {
    try {
      qWhereValue = decodeURIComponent(query).trim().toLowerCase();
    } catch (e) {
      //
    }
  } else if (searchParams.has("q")) {
    res.statusCode = 302;
    res.setHeader("Location", "/backstage");
    return;
  }

  let qWhereCondition = ``;

  if (qWhereValue) {
    if (
      !(
        qWhereValue === "private" ||
        qWhereValue === "public" ||
        qWhereValue === "internal"
      )
    ) {
      qWhereCondition += ` AND (instr(id, $query) OR instr(lower(slug), $query) OR instr(lower(text), $query))`;
    }

    if (qWhereValue === "private" || qWhereValue.startsWith("private ")) {
      qWhereCondition += ` AND private`;
      qWhereValue = qWhereValue.slice("private".length).trim();
    } else if (
      qWhereValue === "internal" ||
      qWhereValue.startsWith("internal ")
    ) {
      qWhereCondition += ` AND internal`;
      qWhereValue = qWhereValue.slice("internal".length).trim();
    } else if (qWhereValue === "public" || qWhereValue.startsWith("public ")) {
      qWhereCondition += ` AND (NOT draft AND NOT internal AND NOT private)`;
      qWhereValue = qWhereValue.slice("public".length).trim();
    }
  }

  const drafts = offset
    ? []
    : await db.all(
        `
          SELECT
            id,
            slug,
            draft,
            internal,
            private,
            (NOT draft AND NOT internal AND NOT private) public,
            lang,
            text,
            strftime('%s000', created) created,
            strftime('%s000', modified) modified
          FROM posts
          WHERE draft ${qWhereCondition}
          ORDER BY datetime(created) DESC, id DESC
        `,
        {
          ...(qWhereValue ? { $query: qWhereValue } : {}),
        }
      );

  const posts = await db.all(
    `
      SELECT
        id,
        slug,
        draft,
        internal,
        private,
        (NOT draft AND NOT internal AND NOT private) public,
        lang,
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
      ...(qWhereValue ? { $query: qWhereValue } : {}),
    }
  );

  const morePosts = posts.length > PAGE_SIZE;
  const suggestion = await getSuggestion(db, req);
  const embedsLoader = new EmbedsLoader(db);

  return render("list.mustache", {
    q: query || "",
    drafts: await Promise.all(
      drafts
        .map((p) =>
          p.text.startsWith("#")
            ? { ...p, text: p.text.trim().split("\n")[0] }
            : p
        )
        .map((p) =>
          prepare(p, {
            baseUrl: req.absolute,
            embedsLoader: embedsLoader,
          })
        )
    ),
    posts: await Promise.all(
      posts.slice(0, PAGE_SIZE).map((p) =>
        prepare(p, {
          baseUrl: req.absolute,
          embedsLoader: embedsLoader,
        })
      )
    ),
    suggestion: suggestion,
    goaccess: !!process.env.GOACCESS_JSON,
    urls: {
      logout: new URL("/backstage/?logout=1", req.absolute).toString(),
      older: morePosts
        ? new URL(
            `/backstage/?` +
              new URLSearchParams({
                q: query,
                offset: offset + PAGE_SIZE,
              }),
            req.absolute
          ).toString()
        : null,
      newest:
        offset > PAGE_SIZE
          ? new URL(
              `/backstage/` +
                (query
                  ? "?" +
                    new URLSearchParams({
                      q: query,
                    })
                  : ""),
              req.absolute
            ).toString()
          : null,
      newer:
        +offset <= PAGE_SIZE
          ? new URL(
              `/backstage/` +
                (query
                  ? "?" +
                    new URLSearchParams({
                      q: query,
                    })
                  : ""),
              req.absolute
            ).toString()
          : +offset
          ? new URL(
              `/backstage/?` +
                new URLSearchParams({
                  q: query,
                  offset: Math.max(offset - PAGE_SIZE, 0),
                }),
              req.absolute
            ).toString()
          : null,
    },
  });
};
