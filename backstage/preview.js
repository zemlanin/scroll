const fs = require("fs");
const url = require("url");
const path = require("path");

const jsdiff = require("diff");
const cheerio = require("cheerio");
const prettier = require("prettier");

const { authed } = require("./auth.js");
const { prepare: commonPrepare, getBlogObject, DIST } = require("../common.js");
const { blogRender } = require("../render.js");
const EmbedsLoader = require("../embeds-loader.js");

async function prepare(post, options) {
  return {
    ...(await commonPrepare(post, options.embedsLoader)),
    url: options.url,
  };
}

function rssEscape(url) {
  return url.replace(/&/g, "%26");
}

module.exports = async (req, res) => {
  const query = url.parse(req.url, true).query;
  const rss = (req.post && req.post.rss) || query.rss;

  const user = authed(req, res);

  if (!user && !rss) {
    return `<a href="/backstage">auth</a>`;
  }

  const existingPostId = query.id || (req.post && req.post.id);

  let post = {
    id: existingPostId || `id-${Math.random()}`,
    slug: null,
    draft: true,
    internal: false,
    private: false,
    public: false,
    created: +new Date(),
  };

  const db = await req.db();
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
    } else {
      res.statusCode = 404;
      return `post not found`;
    }
  }

  if (req.method === "POST") {
    post.text = req.post.text;
    post.created = +new Date(req.post.created);
  }

  if (post.text == undefined) {
    res.statusCode = 400;
    return `nothing to preview`;
  }

  const preparedPost = await prepare(post, {
    url: url.resolve(req.absolute, `/backstage/preview/?id=${post.id}`),
    baseUrl: url.resolve(req.absolute, "/"),
    embedsLoader: new EmbedsLoader(db, false),
  });

  const blog = await getBlogObject(req.absolute);
  blog.url = url.resolve(req.absolute, "/backstage");

  if (rss) {
    res.setHeader("content-type", "text/xml");

    return blogRender("rss.mustache", {
      blog: {
        ...blog,
        title: `${blog.title} / ${preparedPost.title}`,
        feed: {
          ...blog.feed,
          url: rssEscape(
            url.resolve(req.absolute, `/backstage/preview/?id=${post.id}&rss=1`)
          ),
        },
      },
      posts: [preparedPost],
      pubDate: new Date().toUTCString(),
    });
  }

  const naked = (req.post && req.post.naked) || query.naked;

  if (naked) {
    return (preparedPost.htmlTitle || "") + preparedPost.html;
  }

  const showTeaser = (req.post && req.post.teaser) || query.teaser;

  if (showTeaser) {
    return blogRender("list.mustache", {
      blog: blog,
      posts: [preparedPost],
      url: preparedPost.url,
      older: null,
      newer: null,
    });
  }

  const showDiff = (req.post && req.post.diff) || query.diff;

  if (showDiff) {
    if (!existingPostId) {
      res.statusCode = 400;
      return `nothing to diff`;
    }

    let existingPost;
    const postFilename = post.internal
      ? `${post.slug}.html`
      : `${existingPostId}.html`;

    try {
      existingPost = fs.readFileSync(path.join(DIST, postFilename)).toString();
    } catch (e) {
      res.statusCode = 400;
      return `nothing to diff`;
    }

    const normalizedHtml = prettier.format(
      cheerio
        .load((preparedPost.htmlTitle || "") + preparedPost.html)("body")
        .html(),
      { parser: "html", printWidth: Infinity }
    );

    const existingPostHtml = prettier.format(
      cheerio.load(existingPost)("article").html(),
      { parser: "html", printWidth: Infinity }
    );

    const diff = jsdiff.diffLines(existingPostHtml, normalizedHtml).filter(
      // couldn't make `cheerio` delete `<time>` from the article html
      (chunk) =>
        !(
          chunk.removed &&
          chunk.value.trim().startsWith("<time datetime=") &&
          chunk.value.trim().endsWith("</time>")
        )
    );

    const removed = diff.reduce((acc, chunk) => acc + !!chunk.removed, 0);
    const added = diff.reduce((acc, chunk) => acc + !!chunk.added, 0);

    const diffTitle =
      removed || added
        ? `<h3><span style='color:red'>-${removed}</span> / <span style='color:green'>+${added}</span></h3>`
        : `<h3>no changes</h3>`;

    return (
      diffTitle +
      `<pre><code>` +
      diff
        .map(
          (chunk) =>
            `<span ${
              chunk.removed
                ? "style='color: white; background-color: red'"
                : chunk.added
                ? "style='color: white; background-color: green'"
                : ""
            }>${chunk.value
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")}</span>`
        )
        .join("") +
      `</code></pre>`
    );
  }

  return blogRender("post.mustache", {
    blog: blog,
    title: preparedPost.title,
    post: preparedPost,
    url: preparedPost.url,
    older: null,
    newer: null,
  });
};
