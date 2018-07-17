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
const { authed } = require("./auth.js");
const { renderer, prepare: commonPrepare } = require("../common.js");
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
    header: await loadTemplate(
      path.resolve(__dirname, "..", "templates", "header.mustache")
    ),
    footer: await loadTemplate(
      path.resolve(__dirname, "..", "templates", "footer.mustache")
    )
  });
}

function prepare(post, options) {
  return {
    ...commonPrepare(post),
    url: options.url,
    html: marked(post.text.replace(/¯\\_\(ツ\)_\/¯/g, "¯\\\\\\_(ツ)\\_/¯"), {
      baseUrl: options.baseUrl
    }),
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
    created: +new Date,
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
