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
const { IMPORT_ICONS, renderer } = require("../common.js");
const sqlite = require("sqlite");
const mustache = require("mustache");
const marked = require("marked");
const cheerio = require("cheerio");

marked.setOptions({
  gfm: true,
  smartypants: false,
  renderer: renderer,
  baseUrl: null
});

async function loadTemplate(tmpl) {
  return (
    loadTemplate.cache[tmpl] ||
    (loadTemplate.cache[tmpl] = (await fs.readFile(tmpl)).toString())
  );
}
loadTemplate.cache = {};

async function render(tmpl, data) {
  return mustache.render(await loadTemplate(tmpl), data, {
    header: await loadTemplate(path.resolve(__dirname, "..", "templates", "header.mustache")),
    footer: await loadTemplate(path.resolve(__dirname, "..", "templates", "footer.mustache"))
  });
}

function prepare(req, post) {
  const tokens = marked.lexer(post.text);

  const header1Token = tokens.find(t => t.type === "heading" && t.text);

  let title = post.id;
  const postUrl = url.resolve(
    req.absolute,
    `/backstage/?preview=${post.slug || post.id}`
  );

  if (header1Token) {
    title = cheerio.load(marked(header1Token.text)).text();
    post.text = post.text.replace(
      header1Token.text,
      `[${header1Token.text}](${postUrl})`
    );
  }

  let imported;

  if (post.import_url) {
    if (post.id.startsWith("twitter-")) {
      imported = {
        icon: IMPORT_ICONS.twitter,
        url: post.import_url
      };
    } else if (post.id.startsWith("tumblr-")) {
      imported = {
        icon: post.id.startsWith("tumblr-zem")
          ? IMPORT_ICONS.tumblr.zem
          : IMPORT_ICONS.tumblr.doremarkable,
        url: post.import_url
      };
    } else if (post.id.startsWith("wordpress-")) {
      imported = {
        icon: IMPORT_ICONS.wordpress
      };
    } else if (post.id.startsWith("instagram-")) {
      imported = {
        icon: IMPORT_ICONS.instagram
      };
    }
  }

  return {
    id: post.id,
    url: postUrl,
    title,
    text: post.text,
    html: marked(post.text.replace(/¯\\_\(ツ\)_\/¯/g, "¯\\\\\\_(ツ)\\_/¯")),
    created: new Date(parseInt(post.created)).toISOString(),
    createdUTC: new Date(parseInt(post.created)).toUTCString(),
    imported
  };
}

async function preview(req) {
  const db = await sqlite.open(path.resolve(__dirname, "..", "posts.db"));
  const query = url.parse(req.url, true).query;

  const post = await db.get(
    `
    SELECT id, slug, draft, text, strftime('%s000', created) created, import_url
    FROM posts
    WHERE id = ?1
    LIMIT 1
  `,
    { 1: query.preview }
  );

  const preparedPost = prepare(req, post);

  return render(path.resolve(__dirname, "..", "templates", "post.mustache"), {
    blog: {
      title: "< backstage",
      url: url.resolve(req.absolute, "/backstage")
    },
    title: preparedPost.title,
    post: preparedPost,
    url: preparedPost.url,
    older: null,
    newer: null
  });
}

const PAGE_SIZE = 20

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

  if (query.preview) {
    return preview(req, res);
  }

  const db = await sqlite.open(path.resolve(__dirname, "..", "posts.db"));
  const offset = +query.offset || 0
  const posts = await db.all(
    `
    SELECT id, slug, draft, text, strftime('%s000', created) created, import_url
    FROM posts
    ORDER BY created DESC
    LIMIT ?2 OFFSET ?1
  `,
    { 1: offset, 2: PAGE_SIZE + 1 }
  );

  const morePosts = posts.length > PAGE_SIZE;

  return render(path.resolve(__dirname, "templates", "list.mustache"), {
    user: user,
    posts: posts.slice(0, PAGE_SIZE).map(p =>
      Object.assign(p, {
        urls: {
          edit: url.resolve(req.absolute, `/backstage/?edit=${p.id}`),
          preview: url.resolve(req.absolute, `/backstage/?preview=${p.id}`),
          permalink: url.resolve(req.absolute, `/${p.slug || p.id}.html`)
        }
      })
    ),
    urls: {
      logout: url.resolve(req.absolute, "/backstage/?logout=1"),
      older: morePosts ? url.resolve(req.absolute, `/backstage/?offset=${offset + PAGE_SIZE}`) : null,
      newer: +offset ? url.resolve(req.absolute, `/backstage/?offset=${Math.max(offset - PAGE_SIZE, 0)}`) : null,
    }
  });
};
