const fetchModule = import("node-fetch");

const { nanoid, getBlogObject } = require("../common");
const {
  createMessage,
  notifyFollowers,
} = require("../activitystreams/outbox.js");
const getPostId = () =>
  `post-${new Date().getFullYear()}-${(new Date().getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${nanoid.post()}`;

const { getSession, sendToAuthProvider } = require("./auth.js");
const { getJson: getMediaJson } = require("./media.js");
const {
  generateAfterEdit,
  generateActivityStreamNote,
  getPost,
} = require("../generate-post.js");
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

    const { searchParams } = new URL(req.url, req.absolute);

    const id = searchParams.get("id");
    const existingPostId = id || (req.post && req.post.id);

    const db = await req.db();

    if (searchParams.has("latest")) {
      const latestPost = await db.get(
        `SELECT id FROM posts ORDER BY datetime(created) DESC, id DESC LIMIT 1`
      );

      res.writeHead(302, {
        Location: new URL(
          `/backstage/edit/?id=${latestPost.id}`,
          req.absolute
        ).toString(),
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

    if (id) {
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
        { 1: id }
      );

      if (dbPost) {
        dbPost.created = new Date(parseInt(dbPost.created))
          .toISOString()
          .replace(/:\d{2}\.\d{3}Z$/, "");
        post = dbPost;
      }
    } else {
      const text = searchParams.get("text");
      if (text) {
        try {
          post.text = text;
        } catch (e) {
          //
        }
      }

      const slug = searchParams.get("slug");
      if (slug && slug.text(SLUG_REGEX)) {
        post.slug = slug;
      }

      const created = searchParams.get("created");
      if (created) {
        try {
          const parsedDate = new Date(created)
            .toISOString()
            .replace(/:\d{2}\.\d{3}Z$/, "");

          post.created = parsedDate;
        } catch (e) {
          //
        }
      }
    }

    const append = searchParams.get("append");
    if (append) {
      try {
        post.text = post.text ? post.text.trimEnd() + "\n\n" + append : append;
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
        logout: new URL("/backstage/?logout=1", req.absolute).toString(),
      },
      mediaJson: mediaJson,
    });
  },
  post: async (req, res) => {
    const session = await getSession(req, res);
    if (!session) {
      return sendToAuthProvider(req, res);
    }

    const { searchParams } = new URL(req.url, req.absolute);
    const existingPostId = searchParams.get("id") || (req.post && req.post.id);

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
        oldStatus = getStatusValue(post);
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

    const newStatus = getStatusValue(post);
    if (
      (oldStatus === "public" && oldStatus !== newStatus) ||
      newStatus === "public"
    ) {
      await notifyWebSub();
    }

    if (oldStatus === "public" || newStatus === "public") {
      const asdb = await req.asdb();

      await notifyActivityStreams(
        db,
        asdb,
        post.id,
        newStatus === oldStatus
          ? "Update"
          : newStatus === "public"
          ? "Create"
          : // `oldStatus === "public"`
            "Delete"
      );
    }

    if (!existingPostId) {
      res.writeHead(303, {
        Location: new URL(
          `/backstage/edit/?id=${post.id}`,
          req.absolute
        ).toString(),
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
        logout: new URL("/backstage/?logout=1", req.absolute).toString(),
      },
      mediaJson: mediaJson,
    });
  },
};

function getStatusValue(post) {
  if (!post) {
    return null;
  }

  if (post.draft) {
    return "draft";
  } else if (post.internal) {
    return "internal";
  } else if (post.private) {
    return "private";
  } else if (post.public) {
    return "public";
  }

  return null;
}

async function notifyActivityStreams(db, asdb, postId, type) {
  // `post` here is "prepared" one, while the one in `module.exports.post` is "raw" db one
  const post = await getPost(db, postId);
  const blog = await getBlogObject();
  const object = generateActivityStreamNote(post, blog);

  const messageId = await createMessage(asdb, {
    type,
    from: blog.activitystream.id,
    object: type === "Delete" ? object.id : object,
  });
  await notifyFollowers(asdb, messageId, blog.activitystream.id);
}

async function notifyWebSub() {
  const { default: fetch } = await fetchModule;

  const { feed } = await getBlogObject();

  if (!feed.websub) {
    return;
  }

  try {
    await fetch(feed.websub, {
      method: "post",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "hub.mode": "publish",
        "hub.url": feed.url,
      }).toString(),
    });
  } catch (e) {
    console.log(e);
  }
}
