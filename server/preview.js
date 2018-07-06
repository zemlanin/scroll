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
    header: await loadTemplate(
      path.resolve(__dirname, "..", "templates", "header.mustache")
    ),
    footer: await loadTemplate(
      path.resolve(__dirname, "..", "templates", "footer.mustache")
    )
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

  const created = new Date(post.created);

  return {
    id: post.id,
    url: options.url,
    draft: post.draft,
    private: post.private,
    public: post.public,
    title,
    text: post.text,
    html: marked(post.text.replace(/¯\\_\(ツ\)_\/¯/g, "¯\\\\\\_(ツ)\\_/¯"), {
      baseUrl: options.baseUrl
    }),
    created: created.toISOString(),
    createdDate: created.toISOString().split("T")[0],
    createdUTC: created.toUTCString(),
    imported
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
    created: new Date().toISOString(),
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
      dbPost.created = new Date(parseInt(dbPost.created)).toISOString();
      post = dbPost;
    }
  }

  if (req.method === "POST") {
    post.text = req.post.text;
  }

  if (req.method === "POST") {
    post.created = req.post.created;
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
