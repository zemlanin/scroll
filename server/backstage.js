const url = require("url");
const _fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const fs = {
  mkdir: promisify(_fs.mkdir),
  access: promisify(_fs.access),
  readFile: promisify(_fs.readFile),
  writeFile: promisify(_fs.writeFile),
  exists: promisify(_fs.exists)
};
const { authed, logout } = require("./auth.js");
const sqlite = require("sqlite");
const mustache = require("mustache");

async function loadTemplate(tmpl) {
  return (
    loadTemplate.cache[tmpl] ||
    (loadTemplate.cache[tmpl] = (await fs.readFile(tmpl)).toString())
  );
}
loadTemplate.cache = {};

async function render(tmpl, data) {
  return mustache.render(await loadTemplate(tmpl), data, {
    header: await loadTemplate(
      path.resolve(__dirname, "..", "templates", "header.mustache")
    ),
    footer: await loadTemplate(
      path.resolve(__dirname, "..", "templates", "footer.mustache")
    )
  });
}

const PAGE_SIZE = 20;

module.exports = async (req, res) => {
  const indieAuthUrl = url.format({
    protocol: "https",
    hostname: "indieauth.com",
    pathname: "/auth",
    query: {
      me: "zemlan.in",
      client_id: url.resolve(req.absolute, "/backstage"),
      redirect_uri: url.resolve(req.absolute, "/backstage/callback")
    }
  });

  const query = url.parse(req.url, true).query;

  if (query.logout) {
    logout(res);

    return `<a href="${indieAuthUrl}">auth</a>`;
  }

  const user = authed(req, res);

  if (!user) {
    return `<a href="${indieAuthUrl}">auth</a>`;
  }

  const db = await sqlite.open(path.resolve(__dirname, "..", "posts.db"));
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
        strftime('%s000', modified) modified,
        import_url
      FROM posts
      ORDER BY created DESC
      LIMIT ?2 OFFSET ?1
    `,
    { 1: offset, 2: PAGE_SIZE + 1 }
  );

  const morePosts = posts.length > PAGE_SIZE;
  const suggestion =
    query.src && query.src.toString().match(/^[a-z0-9_-]+$/i)
      ? {
          text: `edit ${query.src}`,
          url: `/backstage/edit/?id=${query.src}`
        }
      : null;

  return render(path.resolve(__dirname, "templates", "list.mustache"), {
    user: user,
    posts: posts.slice(0, PAGE_SIZE).map(p =>
      Object.assign(p, {
        urls: {
          edit: url.resolve(req.absolute, `/backstage/edit/?id=${p.id}`),
          preview: url.resolve(req.absolute, `/backstage/preview/?id=${p.id}`),
          permalink: url.resolve(req.absolute, `/${p.slug || p.id}.html`)
        }
      })
    ),
    suggestion: suggestion,
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
