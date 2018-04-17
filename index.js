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
const chunk = require("lodash.chunk");
const cheerio = require("cheerio");

const renderer = new marked.Renderer();
const ogImage = renderer.image.bind(renderer);
const ogLink = renderer.link.bind(renderer);
const ogHTML = renderer.html.bind(renderer);
const ogParagraph = renderer.paragraph.bind(renderer);
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
  html = html.replace(/((src|href|poster)=['"])\/media\//g, "$1media/");

  return ogHTML(html);
};

renderer.paragraph = function(text) {
  text = text.replace(/((src|href|poster)=['"])\/media\//g, "$1media/");

  return ogParagraph(text);
};

marked.setOptions({
  gfm: true,
  smartypants: false,
  renderer: renderer
});

const IMPORT_ICONS = {
  wordpress: `
    <svg version="1.0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 122.523 122.523">
      <path d="M8.708,61.26c0,20.802,12.089,38.779,29.619,47.298L13.258,39.872
        C10.342,46.408,8.708,53.641,8.708,61.26z"/>
      <path d="M96.74,58.608c0-6.495-2.333-10.993-4.334-14.494c-2.664-4.329-5.161-7.995-5.161-12.324
        c0-4.831,3.664-9.328,8.825-9.328c0.233,0,0.454,0.029,0.681,0.042c-9.35-8.566-21.807-13.796-35.489-13.796
        c-18.36,0-34.513,9.42-43.91,23.688c1.233,0.037,2.395,0.063,3.382,0.063c5.497,0,14.006-0.667,14.006-0.667
        c2.833-0.167,3.167,3.994,0.337,4.329c0,0-2.847,0.335-6.015,0.501L48.2,93.547l11.501-34.493l-8.188-22.434
        c-2.83-0.166-5.511-0.501-5.511-0.501c-2.832-0.166-2.5-4.496,0.332-4.329c0,0,8.679,0.667,13.843,0.667
        c5.496,0,14.006-0.667,14.006-0.667c2.835-0.167,3.168,3.994,0.337,4.329c0,0-2.853,0.335-6.015,0.501l18.992,56.494
        l5.242-17.517C95.011,68.328,96.74,63.107,96.74,58.608z"/>
      <path d="M62.184,65.857l-15.768,45.819c4.708,1.384,9.687,2.141,14.846,2.141c6.12,0,11.989-1.058,17.452-2.979
        c-0.141-0.225-0.269-0.464-0.374-0.724L62.184,65.857z"/>
      <path d="M107.376,36.046c0.226,1.674,0.354,3.471,0.354,5.404c0,5.333-0.996,11.328-3.996,18.824l-16.053,46.413
        c15.624-9.111,26.133-26.038,26.133-45.426C113.815,52.124,111.481,43.532,107.376,36.046z"/>
      <path d="M61.262,0C27.483,0,0,27.481,0,61.26c0,33.783,27.483,61.263,61.262,61.263
        c33.778,0,61.265-27.48,61.265-61.263C122.526,27.481,95.04,0,61.262,0z M61.262,119.715c-32.23,0-58.453-26.223-58.453-58.455
        c0-32.23,26.222-58.451,58.453-58.451c32.229,0,58.45,26.221,58.45,58.451C119.712,93.492,93.491,119.715,61.262,119.715z"/>
    </svg>`,
  tumblr: {
    zem: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path fill="#36465d" d="M702.77,799.58C680.56,823.3,629.09,839.4,583,840.16l-5.06,0c-154.84,0-188.47-113.84-188.47-180.29V475.26h-61a12.79,12.79,0,0,1-12.79-12.79V375.29a21.72,21.72,0,0,1,14.47-20.46c79.49-28,104.42-97.37,108.11-150.1,1-14.09,8.37-20.92,20.6-20.92h90.92a12.79,12.79,0,0,1,12.79,12.79V344.25H669A12.79,12.79,0,0,1,681.8,357V461.77A12.79,12.79,0,0,1,669,474.55H562.08V645.28c0,42.87,28.25,54.7,45.7,54.7,16.74-.4,33.22-5.5,41.48-8.82,6.13-2.46,11.52-4.09,16.34-2.88,4.49,1.12,7.44,4.3,9.43,10.1l28.21,82.4C705.53,787.38,707.5,794.53,702.77,799.58Z"/></svg>`,
    doremarkable: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path fill="#ff6961" d="M702.77,799.58C680.56,823.3,629.09,839.4,583,840.16l-5.06,0c-154.84,0-188.47-113.84-188.47-180.29V475.26h-61a12.79,12.79,0,0,1-12.79-12.79V375.29a21.72,21.72,0,0,1,14.47-20.46c79.49-28,104.42-97.37,108.11-150.1,1-14.09,8.37-20.92,20.6-20.92h90.92a12.79,12.79,0,0,1,12.79,12.79V344.25H669A12.79,12.79,0,0,1,681.8,357V461.77A12.79,12.79,0,0,1,669,474.55H562.08V645.28c0,42.87,28.25,54.7,45.7,54.7,16.74-.4,33.22-5.5,41.48-8.82,6.13-2.46,11.52-4.09,16.34-2.88,4.49,1.12,7.44,4.3,9.43,10.1l28.21,82.4C705.53,787.38,707.5,794.53,702.77,799.58Z"/></svg>`
  },
  twitter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><path fill="#1da1f2" d="M67.812 16.141a26.246 26.246 0 0 1-7.519 2.06 13.134 13.134 0 0 0 5.756-7.244 26.127 26.127 0 0 1-8.313 3.176A13.075 13.075 0 0 0 48.182 10c-7.229 0-13.092 5.861-13.092 13.093 0 1.026.118 2.021.338 2.981-10.885-.548-20.528-5.757-26.987-13.679a13.048 13.048 0 0 0-1.771 6.581c0 4.542 2.312 8.551 5.824 10.898a13.048 13.048 0 0 1-5.93-1.638c-.002.055-.002.11-.002.162 0 6.345 4.513 11.638 10.504 12.84a13.177 13.177 0 0 1-3.449.457c-.846 0-1.667-.078-2.465-.231 1.667 5.2 6.499 8.986 12.23 9.09a26.276 26.276 0 0 1-16.26 5.606A26.21 26.21 0 0 1 4 55.976a37.036 37.036 0 0 0 20.067 5.882c24.083 0 37.251-19.949 37.251-37.249 0-.566-.014-1.134-.039-1.694a26.597 26.597 0 0 0 6.533-6.774z"></path></svg>`
};

const BLOG_TITLE = "zemlan.in";
const BLOG_BASE_URL = ".";

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
  return post.slug
    ? `${BLOG_BASE_URL}/${post.id}-${post.slug}.html`
    : `${BLOG_BASE_URL}/${post.id}.html`;
}

async function generate() {
  if (fs.access("dist", _fs.constants.W_OK)) {
    rmrf("dist");
  }

  await fs.mkdir("dist");

  const db = await sqlite.open("./posts.db");

  const posts = await db.all(`
    SELECT id, slug, draft, text, strftime('%s000', created) created, import_url
    from posts
    ORDER BY created DESC
  `);
  // const posts = await db.all(`SELECT * from posts WHERE id LIKE "tumblr%" ORDER BY created DESC`);

  const postTitles = {};

  const preparedPosts = posts.map((post, i) => {
    const tokens = marked.lexer(post.text)

    const gotHeader1Token = tokens.find(t => t.type === "heading" && t.depth === "1")
    const firstMarkdownToken = tokens.find(t => t.type !== "space");

    const titleToken =
      gotHeader1Token && gotHeader1Token.text ||
      firstMarkdownToken && firstMarkdownToken.type === "heading" && firstMarkdownToken.text ||
      null;

    let title = post.id

    if (titleToken) {
      title = cheerio.load(marked(titleToken)).text()
    }

    postTitles[post.id] = title;

    const html = marked(post.text.replace(/¯\\_\(ツ\)_\/¯/g, '¯\\\\\\_(ツ)\\_/¯'));

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
      }
    }

    const prevPost = i ? posts[i - 1] : null;
    const nextPost = posts[i + 1];

    return {
      id: post.id,
      url: getPostUrl(post),
      title,
      html,
      created: new Date(parseInt(post.created)).toISOString(),
      prev: prevPost && { id: prevPost.id, url: getPostUrl(prevPost) },
      next: nextPost && { id: nextPost.id, url: getPostUrl(nextPost) },
      imported
    };
  });

  for (const postsChunk of chunk(preparedPosts, 16)) {
    await Promise.all(
      postsChunk.map(async post =>
        fs.writeFile(
          `./dist/${post.url}`,
          await render("./post.mustache", {
            blog: {
              title: BLOG_TITLE,
              url: BLOG_BASE_URL + "/index.html"
            },
            title: post.title,
            post,
            url: post.url,
            prev: post.prev
              ? {
                  text: postTitles[post.prev.id] || post.prev.id,
                  url: post.prev.url
                }
              : null,
            next: post.next
              ? {
                  text: postTitles[post.next.id] || post.next.id,
                  url: post.next.url
                }
              : null
          })
        )
      )
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
      await render("./list.mustache", {
        blog: {
          title: BLOG_TITLE,
          url: BLOG_BASE_URL + "/index.html"
        },
        title: month,
        url: url,
        posts: groupByMonth[month],
        prev: prevMonth
          ? { text: prevMonth, url: `${BLOG_BASE_URL}/${prevMonth}.html` }
          : null,
        next: nextMonth
          ? { text: nextMonth, url: `${BLOG_BASE_URL}/${nextMonth}.html` }
          : null
      })
    );
  }

  const latestMonth = monthGroups[0];
  const oneBeforeTheLastMonth = monthGroups[1];

  await fs.writeFile(
    `./dist/index.html`,
    await render("./list.mustache", {
      blog: {
        title: BLOG_TITLE,
        url: BLOG_BASE_URL + "/index.html"
      },
      posts: groupByMonth[latestMonth],
      prev: null,
      next: {
        text: oneBeforeTheLastMonth,
        url: oneBeforeTheLastMonth + ".html"
      },
      index: true
    })
  );

  await fs.writeFile(
    `./dist/archive.html`,
    await render("./archive.mustache", {
      blog: {
        title: BLOG_TITLE,
        url: BLOG_BASE_URL + "/index.html"
      },
      title: "archive",
      url: "./archive.html",
      months: monthGroups.map(m => ({
        url: `${BLOG_BASE_URL}/${m}.html`,
        text: m,
        count: groupByMonth[m].length
      }))
    })
  );

  const media = await db.all("SELECT * from media");

  await fs.mkdir("dist/media");

  for (const mediaChunk of chunk(media, 16)) {
    await Promise.all(
      mediaChunk.map(async m =>
        fs.writeFile(`./dist/media/${m.id}.${m.ext}`, m.data)
      )
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
