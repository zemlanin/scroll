const url = require("url");
const path = require("path");

const { authed } = require("./auth.js");
const { prepare: commonPrepare, render } = require("../common.js");
const sqlite = require("sqlite");

function prepare(post, options) {
  return {
    ...commonPrepare(post),
    url: options.url
  };
}

module.exports = async (req, res) => {
  const user = authed(req, res);

  if (!user) {
    return `<a href="/backstage">auth</a>`;
  }

  const query = url.parse(req.url, true).query;

  const existingPostId = query.id || (req.post && req.post.id);

  let post = {
    id: existingPostId || `id-${Math.random()}`,
    slug: null,
    draft: true,
    private: false,
    public: false,
    created: +new Date()
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
          strftime('%s000', modified) modified
        FROM posts
        WHERE id = ?1
      `,
      { 1: existingPostId }
    );

    if (dbPost) {
      post = dbPost;
    }
  }

  if (req.method === "POST") {
    post.text = req.post.text;
    post.created = +new Date(req.post.created);
  }

  const preparedPost = prepare(post, {
    url: url.resolve(req.absolute, `/backstage/preview/?id=${post.id}`),
    baseUrl: url.resolve(req.absolute, "/")
  });

  return render(path.resolve(__dirname, "..", "templates", "post.mustache"), {
    blog: {
      title: preparedPost.title,
      url: url.resolve(req.absolute, "/backstage")
    },
    title: preparedPost.title,
    post: preparedPost,
    url: preparedPost.url,
    older: null,
    newer: null
  });
};
