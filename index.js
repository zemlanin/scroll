const _fs = require("fs");
const { promisify } = require("util");

const fs = {
  mkdir: promisify(_fs.mkdir),
  access: promisify(_fs.access),
  readFile: promisify(_fs.readFile),
  writeFile: promisify(_fs.writeFile)
};

const sqlite = require("sqlite");
const marked = require("marked");
const mustache = require("mustache");
const groupBy = require("lodash.groupby");

const renderer = new marked.Renderer();
const ogImage = renderer.image.bind(renderer);
renderer.image = function(href, title, text) {
  const youtubeId = href.match(
    /(youtu\.be\/|youtube\.com\/watch\?v=)([^&\\]+)/
  );
  if (youtubeId) {
    href = `https://www.youtube.com/embed/${youtubeId[2]}`;
  }

  const vimeoId = href.match(/(vimeo\.com\/)(\d+)/);
  if (vimeoId) {
    href = `https://player.vimeo.com/video/${vimeoId[2]}`;
  }

  if (href.indexOf("//www.youtube.com/embed/") > -1) {
    return `<iframe src="${href}" width="640" height="360" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
  }

  if (href.indexOf("//player.vimeo.com/video/") > -1) {
    return `<iframe src="${href}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;
  }

  return ogImage(href, title, text);
};

marked.setOptions({
  gfm: true,
  renderer: renderer
});

const rmrf = require("./rmrf.js");

async function loadTemplate(tmpl) {
  return (
    loadTemplate.cache[tmpl] ||
    (loadTemplate.cache[tmpl] = (await fs.readFile(tmpl)).toString())
  );
}
loadTemplate.cache = {};

async function render(tmpl, data) {
  return mustache.render(await loadTemplate(tmpl), data, {
    header: await loadTemplate("./header.mustache"),
    footer: await loadTemplate("./footer.mustache")
  });
}

async function generate() {
  if (fs.access("dist", _fs.constants.W_OK)) {
    rmrf("dist");
  }

  await fs.mkdir("dist");

  const db = await sqlite.open("./posts.db");

  const posts = await db.all("SELECT * from posts ORDER BY created DESC");
  const preparedPosts = posts.map(post => {
    const url = `${post.slug || ""}-${post.id}.html`;

    const markedTokens = marked.lexer(post.text);

    const firstHeading = markedTokens.find(t => t.type === "heading");
    const firstParagraph = markedTokens.find(t => t.type === "paragraph");
    const title =
      (firstHeading && firstHeading.text) ||
      (firstParagraph && firstParagraph.text) ||
      "";

    return {
      url,
      title,
      html: marked(post.text),
      created: post.created
    };
  });

  for (const post of preparedPosts) {
    const url = post.url;

    await fs.writeFile(
      `./dist/${url}`,
      await render("./post.mustache", {
        title: post.title,
        post
      })
    );
  }

  const groupByMonth = groupBy(preparedPosts, v =>
    v.created.match(/^\d{4}-\d{2}/)
  );

  for (const month in groupByMonth) {
    const url = month + ".html";

    await fs.writeFile(
      `./dist/${url}`,
      await render("./archive.mustache", {
        title: month,
        posts: groupByMonth[month]
      })
    );
  }
}

generate()
  .then(() => {
    console.log("done");
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
