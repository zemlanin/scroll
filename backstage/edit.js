const url = require("url");
const { nanoid } = require("../common");
const getPostId = () =>
  `post-${new Date().getFullYear()}-${(new Date().getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${nanoid.post()}`;

const { getSession, sendToAuthProvider } = require("./auth.js");
const { getJson: getMediaJson } = require("./media.js");
const { generateAfterEdit } = require("../generate-post.js");
const { render } = require("./render.js");

const SLUG_REGEX = /^[a-zA-Z0-9_-]+$/;

function parseUTCTimestampWithoutZulu(str) {
  // used in tandem with `<datetime-local>` with UTC values
  const dt = new Date(str);

  dt.setTime(dt.getTime() - dt.getTimezoneOffset() * 60 * 1000);

  return dt;
}

module.exports = {
  getPostId,
  get: async (req, res) => {
    const session = await getSession(req, res);
    if (!session) {
      return sendToAuthProvider(req, res);
    }

    const query = url.parse(req.url, true).query;
    const existingPostId = query.id || (req.post && req.post.id);

    const db = await req.db();

    if (query.latest != null) {
      const latestPost = await db.get(
        `SELECT id FROM posts ORDER BY datetime(created) DESC, id DESC LIMIT 1`
      );

      res.writeHead(302, {
        Location: url.resolve(
          req.absolute,
          `/backstage/edit/?id=${latestPost.id}`
        ),
      });

      return;
    }

    let post = {
      id: existingPostId || getPostId(),
      slug: null,
      draft: true,
      internal: false,
      private: false,
      public: false,
      created: new Date().toISOString().replace(/:\d{2}\.\d{3}Z$/, ""),
      text: "",
    };

    if (query.id) {
      const dbPost = await db.get(
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
    } else {
      if (query.text) {
        try {
          post.text = decodeURIComponent(query.text);
        } catch (e) {
          //
        }
      }

      if (query.slug && query.slug.text(SLUG_REGEX)) {
        post.slug = query.slug;
      }

      if (query.created) {
        try {
          const parsedDate = new Date(query.created)
            .toISOString()
            .replace(/:\d{2}\.\d{3}Z$/, "");

          post.created = parsedDate;
        } catch (e) {
          //
        }
      }
    }

    if (query.append) {
      try {
        post.text = post.text
          ? post.text.trimEnd() + "\n\n" + decodeURIComponent(query.append)
          : decodeURIComponent(query.append);
      } catch (e) {
        //
      }
    }

    post["lang=ru"] = post.lang === "ru";
    post["lang=en"] = post.lang === "en";
    post["lang=uk"] = post.lang === "uk";

    const mediaJson = await getMediaJson(db, { offset: 0 });

    return render("edit.mustache", {
      post: post,
      urls: {
        logout: url.resolve(req.absolute, "/backstage/?logout=1"),
      },
      mediaJson: mediaJson,
    });
  },
  post: async (req, res) => {
    const session = await getSession(req, res);
    if (!session) {
      return sendToAuthProvider(req, res);
    }

    const query = url.parse(req.url, true).query;

    const existingPostId = query.id || (req.post && req.post.id);

    let post = {
      id: existingPostId || getPostId(),
      slug: null,
      draft: true,
      internal: false,
      private: false,
      public: false,
      created: new Date(),
    };

    const db = await req.db();

    let postExists = false;
    let oldSlug = null;
    let oldStatus = null;
    if (existingPostId) {
      const dbPost = await db.get(
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
          WHERE id = ?1
        `,
        { 1: existingPostId }
      );

      if (dbPost) {
        dbPost.created = new Date(parseInt(dbPost.created));
        post = dbPost;
        postExists = true;

        oldSlug = post.slug;

        if (post.draft) {
          oldStatus = "draft";
        } else if (post.internal) {
          oldStatus = "internal";
        } else if (post.private) {
          oldStatus = "private";
        } else if (post.public) {
          oldStatus = "public";
        }
      }
    }

    post.text = req.post.text;

    if (req.post.lang) {
      post.lang = req.post.lang;
    } else if (post.lang) {
      post.lang = null;
    }

    if (req.post.slug) {
      post.slug = req.post.slug;
    } else if (post.slug) {
      post.slug = null;
    }

    if (
      req.post.draft != null ||
      req.post.internal != null ||
      req.post.private != null ||
      req.post.public != null
    ) {
      post.draft = Boolean(+req.post.draft);
      post.internal = Boolean(+req.post.internal);
      post.private = Boolean(+req.post.private);
      post.public = Boolean(+req.post.public);
    }

    if (!post.slug && post.internal) {
      post.slug = post.id;
    }

    let oldCreated = null;
    if (req.post.created) {
      oldCreated = post.created;
      post.created = parseUTCTimestampWithoutZulu(req.post.created);
    }

    if (postExists) {
      await db.run(
        `UPDATE posts SET
          slug = ?2,
          draft = ?3,
          internal = ?6,
          private = ?4,
          lang = ?9,
          text = ?5,
          created = ?7,
          modified = ?8
          WHERE id = ?1`,
        {
          1: post.id,
          2: post.slug,
          3: post.draft,
          4: post.private,
          5: post.text,
          6: post.internal,
          7: post.created.toISOString().replace(/\.\d{3}Z$/, "Z"),
          8: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
          9: post.lang || null,
        }
      );
    } else {
      await db.run(
        `INSERT INTO posts
          (id, slug, draft, internal, private, lang, text, created)
          VALUES (?1, ?2, ?3, ?6, ?4, ?9, ?5, ?7)`,
        {
          1: post.id,
          2: post.slug,
          3: post.draft,
          4: post.private,
          5: post.text,
          6: post.internal,
          7: post.created.toISOString().replace(/\.\d{3}Z$/, "Z"),
          9: post.lang || null,
        }
      );
    }

    await generateAfterEdit(db, post.id, oldStatus, oldCreated, oldSlug);

    if (!existingPostId) {
      res.writeHead(303, {
        Location: url.resolve(req.absolute, `/backstage/edit/?id=${post.id}`),
      });

      return;
    }

    post.created = post.created.toISOString().replace(/:\d{2}\.\d{3}Z$/, "");

    post["lang=ru"] = post.lang === "ru";
    post["lang=en"] = post.lang === "en";
    post["lang=uk"] = post.lang === "uk";

    const mediaJson = await getMediaJson(db, { offset: 0 });

    return render("edit.mustache", {
      post: post,
      urls: {
        logout: url.resolve(req.absolute, "/backstage/?logout=1"),
      },
      mediaJson: mediaJson,
    });
  },
};
