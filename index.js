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
marked.setOptions({
  gfm: true
});

const _id = require("nanoid/generate");
const id = () =>
  _id("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 12);

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
      (firstHeading ? firstHeading.text : firstParagraph.text) || "";

    return {
      url,
      title,
      html: marked(post.text),
      created: post.created
    };
  });

  for (const post of preparedPosts) {
    const url = post.url

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
