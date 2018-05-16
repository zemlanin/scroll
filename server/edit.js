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

function prepare(post, options) {
  const tokens = marked.lexer(post.text);

  const header1Token = tokens.find(t => t.type === "heading" && t.text);

  let title = post.id;

  if (header1Token) {
    title = cheerio.load(marked(header1Token.text)).text();
    post.text = post.text.replace(
      header1Token.text,
      `[${header1Token.text}](${options.url})`
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
    url: options.url,
    title,
    text: post.text,
    html: marked(post.text.replace(/¯\\_\(ツ\)_\/¯/g, "¯\\\\\\_(ツ)\\_/¯")),
    created: new Date(parseInt(post.created)).toISOString(),
    createdUTC: new Date(parseInt(post.created)).toUTCString(),
    imported
  };
}

module.exports = {
  get: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      return `<a href="/backstage">auth</a>`;
    }
  
    const query = url.parse(req.url, true).query;

    let post

    if (query.id) {
      const db = await sqlite.open(path.resolve(__dirname, "..", "posts.db"));
      post = await db.get(
      `
      SELECT id, slug, draft, text, strftime('%s000', created) created, import_url
      FROM posts
      WHERE id = ?1
    `,
      { 1: query.id }
    );
    }

    return render(path.resolve(__dirname, "templates", "edit.mustache"), {
      user: user,
      post: post && prepare(post, req.absolute),
      urls: {
        logout: url.resolve(req.absolute, "/backstage/?logout=1"),
      }
    });
  },
  post: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      return `<a href="/backstage">auth</a>`;
    }
  
    const query = url.parse(req.url, true).query;

    let post = {
      id: `id-${Math.random()}`,
      slug: null,
      draft: true,
      created: +new Date,
      import_url: null
    }

    if (query.id) {
      const db = await sqlite.open(path.resolve(__dirname, "..", "posts.db"));
      post = await db.get(
      `
      SELECT id, slug, draft, text, strftime('%s000', created) created, import_url
      FROM posts
      WHERE id = ?1
    `,
      { 1: query.id }
    );
    }
    
    post.text = req.post.text

    return render(path.resolve(__dirname, "templates", "edit.mustache"), {
      user: user,
      post: prepare(post, req.absolute),
      urls: {
        logout: url.resolve(req.absolute, "/backstage/?logout=1"),
      }
    });
  },
};
