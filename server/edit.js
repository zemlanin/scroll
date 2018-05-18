const url = require("url");
const _fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const _id = require("nanoid/generate");
const getPostId = () =>
  "post-" +
  _id("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 16);

const fs = {
  mkdir: promisify(_fs.mkdir),
  access: promisify(_fs.access),
  readFile: promisify(_fs.readFile),
  writeFile: promisify(_fs.writeFile),
  exists: promisify(_fs.exists)
};
const { authed } = require("./auth.js");
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

module.exports = {
  get: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      return `<a href="/backstage">auth</a>`;
    }

    const query = url.parse(req.url, true).query;

    let post;

    if (query.id) {
      const db = await sqlite.open(path.resolve(__dirname, "..", "posts.db"));
      const dbPost = await db.get(
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
          WHERE id = ?1
        `,
        { 1: query.id }
      );

      if (dbPost) {
        post = dbPost;
      }
    }

    return render(path.resolve(__dirname, "templates", "edit.mustache"), {
      user: user,
      post: post,
      urls: {
        logout: url.resolve(req.absolute, "/backstage/?logout=1")
      }
    });
  },
  post: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      return `<a href="/backstage">auth</a>`;
    }

    const query = url.parse(req.url, true).query;

    const existingPostId = query.id || (req.post && req.post.id);

    let post = {
      id: existingPostId || getPostId(),
      slug: null,
      draft: true,
      private: false,
      public: false,
      created: +new Date(),
      import_url: null
    };

    if (existingPostId) {
      const db = await sqlite.open(path.resolve(__dirname, "..", "posts.db"));
      const dbPost = await db.get(
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
          WHERE id = ?1
        `,
        { 1: existingPostId }
      );

      if (dbPost) {
        post = dbPost;
      }
    }

    post.text = req.post.text;

    if (
      req.post.draft != null ||
      req.post.private != null ||
      req.post.public != null
    ) {
      post.draft = Boolean(+req.post.draft);
      post.private = Boolean(+req.post.private);
      post.public = Boolean(+req.post.public);
    }

    if (req.post.slug) {
      post.slug = req.post.slug;
    }

    return render(path.resolve(__dirname, "templates", "edit.mustache"), {
      user: user,
      post: post,
      urls: {
        logout: url.resolve(req.absolute, "/backstage/?logout=1")
      }
    });
  }
};
