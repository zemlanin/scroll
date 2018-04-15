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
const ogLink = renderer.link.bind(renderer);
const ogHTML = renderer.html.bind(renderer);
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

  const funnyOrDieId = href.match(
    /\/\/www\.funnyordie\.com\/videos\/([0-9a-f]+)/
  );
  if (funnyOrDieId) {
    href = `https://www.funnyordie.com/embed/${funnyOrDieId[1]}`;
  }

  if (href.indexOf("//www.youtube.com/embed/") > -1) {
    return `<iframe src="${href}" width="640" height="360" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
  }

  if (href.indexOf("//player.vimeo.com/video/") > -1) {
    return `<iframe src="${href}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;
  }

  if (href.indexOf("//www.funnyordie.com/embed/") > -1) {
    return `<iframe src="${href}" width="640" height="360" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
  }

  if (href.startsWith("/media/")) {
    href = href.slice(1);
  }

  return ogImage(href, title, text);
};

renderer.link = function(href, title, text) {
  if (href.startsWith("/media/")) {
    href = href.slice(1);
  }

  return ogLink(href, title, text);
};

renderer.html = function(html) {
  html = html.replace(/((src|href)=['"])\/media\//g, "$1media/");

  return ogHTML(html);
};

marked.setOptions({
  gfm: true,
  smartypants: false,
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

function getPostUrl(post) {
  return post.slug ? `${post.id}-${post.slug}.html` : `${post.id}.html`;
}

async function generate() {
  if (fs.access("dist", _fs.constants.W_OK)) {
    rmrf("dist");
  }

  await fs.mkdir("dist");

  const db = await sqlite.open("./posts.db");

  const posts = await db.all("SELECT * from posts ORDER BY created DESC");
  // const posts = await db.all(`SELECT * from posts WHERE id LIKE "tumblr%" ORDER BY created DESC`);
  const preparedPosts = posts.map((post, i) => {
    const markedTokens = marked.lexer(post.text);

    const firstHeading = markedTokens.find(t => t.type === "heading");
    const firstParagraph = markedTokens.find(t => t.type === "paragraph");
    const title =
      (firstHeading && firstHeading.text) ||
      (firstParagraph && firstParagraph.text) ||
      "";

    const prevPost = i ? posts[i - 1] : null;
    const nextPost = i ? posts[i + 1] : null;

    return {
      id: post.id,
      url: getPostUrl(post),
      title,
      html: marked(post.text),
      created: post.created,
      prev: prevPost && getPostUrl(prevPost),
      next: nextPost && getPostUrl(nextPost)
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
  const monthGroups = Object.keys(groupByMonth).sort((a, b) => {
    if (a === b) {
      return 0;
    }

    if (a > b) {
      return -1;
    }

    return 1;
  });

  for (const month in groupByMonth) {
    const url = month + ".html";
    const monthIndex = monthGroups.indexOf(month);
    const prevMonth = monthIndex > 0 ? monthGroups[monthIndex - 1] : null;

    const nextMonth = monthIndex > -1 ? monthGroups[monthIndex + 1] : null;

    await fs.writeFile(
      `./dist/${url}`,
      await render("./archive.mustache", {
        title: month,
        posts: groupByMonth[month],
        prev: prevMonth ? prevMonth + ".html" : null,
        next: nextMonth ? nextMonth + ".html" : null
      })
    );
  }

  const latestMonth = monthGroups[0];
  const oneBeforeTheLastMonth = monthGroups[1];

  await fs.writeFile(
    `./dist/index.html`,
    await render("./archive.mustache", {
      title: "index.html",
      posts: groupByMonth[latestMonth],
      prev: null,
      next: oneBeforeTheLastMonth + ".html"
    })
  );

  const media = await db.all("SELECT * from media");

  await fs.mkdir("dist/media");

  for (const m of media) {
    const url = `${m.id}.${m.ext}`;

    await fs.writeFile(`./dist/media/${url}`, m.data);
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
