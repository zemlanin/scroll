const url = require("url");
const path = require("path");

const { authed } = require("./auth.js");
const {
  prepare: commonPrepare,
  render,
  getBlogObject
} = require("../common.js");

async function prepare(post, options) {
  return {
    ...(await commonPrepare(post)),
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

  const db = await req.db();
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

  const preparedPost = await prepare(post, {
    url: url.resolve(req.absolute, `/backstage/preview/?id=${post.id}`),
    baseUrl: url.resolve(req.absolute, "/")
  });

  const showTeaser = (req.post && req.post.teaser) || query.teaser;

  const blog = await getBlogObject(req.absolute);
  blog.url = url.resolve(req.absolute, "/backstage");

  if (showTeaser) {
    return render(path.resolve(__dirname, "..", "templates", "list.mustache"), {
      blog: blog,
      posts: [preparedPost],
      url: preparedPost.url,
      older: null,
      newer: null
    });
  }

  return render(path.resolve(__dirname, "..", "templates", "post.mustache"), {
    blog: blog,
    title: preparedPost.title,
    post: preparedPost,
    url: preparedPost.url,
    older: null,
    newer: null
  });
};
