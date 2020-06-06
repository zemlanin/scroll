const url = require("url");
const formidable = require("formidable");
const { getSession } = require("./auth.js");
const { getPostId } = require("./edit.js");

function processJSON(body) {
  if (body.type && body.type[0] === "h-entry") {
    const properties = body.properties;

    const name = properties.name && properties.name[0];
    const content =
      properties.content &&
      (properties.content[0].markdown ||
        properties.content[0].html ||
        properties.content[0]);
    const postStatus =
      properties["post-status"] && properties["post-status"][0];
    const slug = properties["mp-slug"] && properties["mp-slug"][0];

    return {
      h: "entry",
      slug,
      name,
      content,
      postStatus,
    };
  }
}

function processForm(body) {
  if (body.h === "entry") {
    const name = body.name;
    const content = body.content;
    const slug = body["mp-slug"];

    return {
      h: "entry",
      slug,
      name,
      content,
      postStatus: null,
    };
  }
}

async function createPost(db, { id, title, text, slug }) {
  const post = {
    id: id,
    slug: slug || null,
    draft: true,
    internal: false,
    private: false,
    public: false,
    created: new Date(),
    text: text,
  };

  if (title) {
    post.text = `# ${title}\n\n${post.text}`;
  }

  await db.run(
    `INSERT INTO posts
      (id, slug, draft, internal, private, text, created)
      VALUES (?1, ?2, ?3, ?6, ?4, ?5, ?7)`,
    {
      1: post.id,
      2: post.slug,
      3: post.draft,
      4: post.private,
      5: post.text,
      6: post.internal,
      7: post.created.toISOString().replace(/\.\d{3}Z$/, "Z"),
    }
  );
}

module.exports = {
  async get(req, res) {
    const session = await getSession(req, res);
    if (!session) {
      res.statusCode = 403;
      return "403";
    }

    const query = url.parse(req.url, true).query;

    if (query.q === "config") {
      return {
        // TODO
        // "media-endpoint": "https://media.example.com/micropub"
      };
    }

    return {};
  },
  async post(req, res) {
    const contentType = req.headers["content-type"];

    if (!contentType) {
      res.statusCode = 400;
      return `400`;
    }

    const session = await getSession(req, res);
    if (!session) {
      res.statusCode = 403;
      return "403";
    }

    if (contentType.startsWith("multipart/form-data")) {
      const multipart = await new Promise((resolve, reject) => {
        const form = formidable({ multiples: true });
        form.parse(req, (err, fields, files) => {
          if (err) {
            return reject(err);
          }

          return resolve({ fields, files });
        });
      });

      // TODO
      multipart.toString();

      res.statusCode = 400;
      return `400`;
    }

    if (
      contentType !== "application/json" &&
      contentType !== "application/x-www-form-urlencoded"
    ) {
      res.statusCode = 400;
      return `400`;
    }

    const { h, content, name, slug, postStatus } =
      contentType === "application/json"
        ? processJSON(req.post)
        : processForm(req.post);

    if (h === "entry") {
      const db = await req.db();
      const postId = getPostId();

      await createPost(db, {
        id: postId,
        slug: slug,
        title: name,
        text: content,
        status: postStatus,
      });

      res.statusCode = 201;
      const backstageUrl = new url.URL(
        `/backstage/edit?id=${postId}`,
        req.absolute
      ).href;
      res.setHeader("Location", backstageUrl);
      return;
    }

    res.statusCode = 400;
    return `400`;
  },
};
