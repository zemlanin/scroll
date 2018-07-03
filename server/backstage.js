const url = require("url");
const path = require("path");

const { authed, logout } = require("./auth.js");
const { render } = require("./templates/index.js");
const { renderer } = require("../common.js");
const marked = require("marked");
const sqlite = require("sqlite");
const cheerio = require("cheerio");

const PAGE_SIZE = 20;

marked.setOptions({
  gfm: true,
  smartypants: false,
  renderer: renderer,
  baseUrl: null
});

function prepare(post, options) {
  let tokens = marked.lexer(post.text);

  let title = post.slug || post.id;
  const urls = {
    edit: url.resolve(options.baseUrl, `/backstage/edit/?id=${post.id}`),
    preview: url.resolve(options.baseUrl, `/backstage/preview/?id=${post.id}`),
    permalink: url.resolve(options.baseUrl, `/${post.slug || post.id}.html`)
  };

  const header1Token = tokens.find(t => t.type === "heading" && t.text);

  if (header1Token) {
    const headerUrl =
      post.public || post.private ? urls.permalink : urls.preview;
    title = cheerio.load(marked(header1Token.text)).text();
    post.text = post.text.replace(
      header1Token.text,
      `[${header1Token.text}](${headerUrl})`
    );
  }

  post.text = post.text.replace(/¯\\_\(ツ\)_\/¯/g, "¯\\\\\\_(ツ)\\_/¯");

  tokens = marked.lexer(post.text);
  const shortTokens = [];
  let paragraphsCounter = 0;
  for (const token of tokens) {
    shortTokens.push(token);

    if (token.type === "paragraph") {
      paragraphsCounter = paragraphsCounter + 1;
    }

    if (paragraphsCounter >= 3) {
      break;
    }
  }
  shortTokens.links = tokens.links;

  return Object.assign(post, {
    title: title,
    short: marked.parser(shortTokens, {
      baseUrl: options.baseUrl,
      gfm: true,
      smartypants: false,
      renderer: renderer
    }),
    urls: urls
  });
}

module.exports = async (req, res) => {
  const indieAuthUrl = url.format({
    protocol: "https",
    hostname: "indieauth.com",
    pathname: "/auth",
    query: {
      me: "zemlan.in",
      client_id: url.resolve(req.absolute, "/backstage"),
      redirect_uri: url.resolve(req.absolute, "/backstage/callback")
    }
  });

  const query = url.parse(req.url, true).query;

  if (query.logout) {
    logout(res);
    res.statusCode = 401;

    return `<a href="${indieAuthUrl}">auth</a>`;
  }

  const user = authed(req, res);

  if (!user) {
    res.statusCode = 401;
    return `<a href="${indieAuthUrl}">auth</a>`;
  }

  const db = await sqlite.open(path.resolve(__dirname, "..", "posts.db"));
  const offset = +query.offset || 0;
  const posts = await db.all(
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
      ORDER BY created DESC
      LIMIT ?2 OFFSET ?1
    `,
    { 1: offset, 2: PAGE_SIZE + 1 }
  );

  const morePosts = posts.length > PAGE_SIZE;
  const suggestion =
    query.src && query.src.toString().match(/^[a-z0-9_-]+$/i)
      ? {
          text: `edit ${query.src}`,
          url: `/backstage/edit/?id=${query.src}`
        }
      : null;

  return render("list.mustache", {
    user: user,
    posts: posts.slice(0, PAGE_SIZE).map(p =>
      prepare(p, {
        baseUrl: req.absolute
      })
    ),
    suggestion: suggestion,
    urls: {
      logout: url.resolve(req.absolute, "/backstage/?logout=1"),
      jwt: url.resolve(req.absolute, "/backstage/jwt"),
      older: morePosts
        ? url.resolve(req.absolute, `/backstage/?offset=${offset + PAGE_SIZE}`)
        : null,
      newer: +offset
        ? url.resolve(
            req.absolute,
            `/backstage/?offset=${Math.max(offset - PAGE_SIZE, 0)}`
          )
        : null
    }
  });
};
