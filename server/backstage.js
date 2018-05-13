const url = require("url");
const _fs = require("fs");
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
    // header: await loadTemplate("./templates/header.mustache"),
    // footer: await loadTemplate("./templates/footer.mustache")
  });
}

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

  const db = await sqlite.open("../posts.db");
  const posts = await db.all(
    `
    SELECT id, slug, draft, text, strftime('%s000', created) created, import_url
    FROM posts
    ORDER BY created DESC
    LIMIT 20 OFFSET ?1
  `,
    { 1: query.offset || 0 }
  );

  return render("./templates/list.mustache", {
    user: user,
    posts: posts.map(p =>
      Object.assign(p, {
        urls: { edit: url.resolve(req.absolute, `/backstage/?edit=${p.id}`) }
      })
    ),
    urls: {
      logout: url.resolve(req.absolute, "/backstage/?logout=1")
    }
  });
};
