const url = require("url");
const path = require("path");
const _id = require("nanoid/generate");
const getPostId = () =>
  `post-${new Date().getFullYear()}-${(new Date().getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${_id(
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    10
  )}`;

const { authed } = require("./auth.js");
const { render } = require("./templates/index.js");
const sqlite = require("sqlite");

module.exports = {
  get: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      res.statusCode = 401;
      return `<a href="/backstage">auth</a>`;
    }

    const query = url.parse(req.url, true).query;
    const existingPostId = query.id || (req.post && req.post.id);

    const db = await sqlite.open(path.resolve(__dirname, "..", "posts.db"));

    if (query.latest != null) {
      const latestPost = await db.get(
        `SELECT id FROM posts ORDER BY created desc LIMIT 1`
      );

      res.writeHead(302, {
        Location: url.resolve(
          req.absolute,
          `/backstage/edit/?id=${latestPost.id}`
        )
      });

      return;
    }

    let post = {
      id: existingPostId || getPostId(),
      slug: null,
      draft: true,
      private: false,
      public: false,
      created: new Date().toISOString().replace(/:\d{2}\.\d{3}Z$/, ""),
      import_url: null
    };

    if (query.id) {
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
        dbPost.created = new Date(parseInt(dbPost.created))
          .toISOString()
          .replace(/:\d{2}\.\d{3}Z$/, "");
        post = dbPost;
      }
    }

    return render("edit.mustache", {
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
      res.statusCode = 401;
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
      created: new Date().toISOString().replace(/:\d{2}\.\d{3}Z$/, ""),
      import_url: null
    };

    const db = await sqlite.open(path.resolve(__dirname, "..", "posts.db"));

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
        dbPost.created = new Date(parseInt(dbPost.created))
          .toISOString()
          .replace(/:\d{2}\.\d{3}Z$/, "");
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

    if (req.post.created) {
      post.created = new Date(req.post.created + ":00Z")
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z");
    }

    if (postExists) {
      await db.run(
        `UPDATE posts SET
          slug = ?2,
          draft = ?3,
          private = ?4,
          text = ?5,
          import_url = ?6,
          created = ?7,
          modified = ?8
          WHERE id = ?1`,
        {
          1: post.id,
          2: post.slug,
          3: post.draft,
          4: post.private,
          5: post.text,
          6: post.import_url,
          7: post.created,
          8: new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
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
          7: post.created
        }
      );
    }

    if (!existingPostId) {
      res.writeHead(303, {
        Location: url.resolve(req.absolute, `/backstage/edit/?id=${post.id}`)
      });

      return;
    }

    post.created = post.created.replace(/:\d{2}Z$/, "");

    return render("edit.mustache", {
      user: user,
      post: post,
      urls: {
        logout: url.resolve(req.absolute, "/backstage/?logout=1")
      }
    });
  }
};
