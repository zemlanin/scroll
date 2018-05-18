const url = require("url");
const _fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const _id = require("nanoid/generate");
const getPostId = () =>
  `post-${new Date().getFullYear()}-${(new Date().getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${_id(
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    10
  )}`;

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

    const db = await sqlite.open(path.resolve(__dirname, "..", "posts.db"));
    
    if (query.latest === "1") {
      const latestPost = await db.get(`SELECT id FROM posts ORDER BY created desc LIMIT 1`)

      res.writeHead(302, {
        Location: url.resolve(req.absolute, `/backstage/edit/?id=${latestPost.id}`)
      });

      return;
    }

    let postExists = false;
    if (existingPostId) {
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
        postExists = true;
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
    } else if (post.slug) {
      post.slug = null;
    }

    if (req.post.import_url) {
      post.import_url = req.post.import_url;
    } else if (post.import_url) {
      post.import_url = null;
    }

    if (postExists) {
      await db.run(
        `UPDATE posts SET
          slug = ?2,
          draft = ?3,
          private = ?4,
          text = ?5, 
          import_url = ?6, 
          modified = ?7
          WHERE id = ?1`,
        {
          1: post.id,
          2: post.slug,
          3: post.draft,
          4: post.private,
          5: post.text,
          6: post.import_url,
          7: new Date().toISOString()
        }
      );
    } else {
      await db.run(
        `INSERT INTO posts
          (id, slug, draft, private, text, import_url, created)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
        {
          1: post.id,
          2: post.slug,
          3: post.draft,
          4: post.private,
          5: post.text,
          6: post.import_url,
          7: new Date().toISOString()
        }
      );
    }

    if (!existingPostId) {
      res.writeHead(303, {
        Location: url.resolve(req.absolute, `/backstage/edit/?id=${post.id}`)
      });

      return;
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
