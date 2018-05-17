const _fs = require("fs");
const { promisify } = require("util");
const os = require("os");
const path = require("path");

const fs = {
  mkdir: promisify(_fs.mkdir),
  access: promisify(_fs.access),
  readFile: promisify(_fs.readFile),
  writeFile: promisify(_fs.writeFile),
  exists: promisify(_fs.exists),
  mkdtemp: promisify(_fs.mkdtemp)
};

const sqlite = require("sqlite");
const marked = require("marked");
const mustache = require("mustache");
const groupBy = require("lodash.groupby");
const chunk = require("lodash.chunk");
const cheerio = require("cheerio");
const Rsync = require("rsync");

const { IMPORT_ICONS, renderer } = require("./common.js");

marked.setOptions({
  gfm: true,
  smartypants: false,
  renderer: renderer,
  baseUrl: process.env.BLOG_BASE_URL || null
});

const BLOG_TITLE = "zemlan.in";
const BLOG_BASE_URL = process.env.BLOG_BASE_URL || ".";

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
    header: await loadTemplate("./templates/header.mustache"),
    footer: await loadTemplate("./templates/footer.mustache")
  });
}

function getPostFilename(post) {
  return (!post.draft && post.slug ? post.slug : post.id) + ".html";
}

function getPostUrl(post) {
  return `${BLOG_BASE_URL}/${getPostFilename(post)}`;
}

async function generate() {
  const tmpFolder = await fs.mkdtemp(path.join(os.tmpdir(), "scroll-"));
  await fs.mkdir(path.join(tmpFolder, "/media"));

  const db = await sqlite.open("./posts.db");

  const posts = await db.all(`
    SELECT id, slug, draft, text, strftime('%s000', created) created, import_url
    from posts
    ORDER BY created DESC
  `);
  // const posts = await db.all(`SELECT * from posts WHERE id LIKE "tumblr%" ORDER BY created DESC`);

  const postTitles = {};
  const postsCount = posts.length;

  const preparedPosts = posts.map((post, i) => {
    const tokens = marked.lexer(post.text);

    const header1Token = tokens.find(t => t.type === "heading" && t.text);

    let title = post.id;
    const url = getPostUrl(post);

    if (header1Token) {
      title = cheerio.load(marked(header1Token.text)).text();
      post.text = post.text.replace(
        header1Token.text,
        `[${header1Token.text}](${url})`
      );
    }

    postTitles[post.id] = title;

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

    let newerPost, olderPost;

    if (!post.draft && i) {
      for (
        let newerIndex = i - 1;
        newerIndex >= 0 && posts[newerIndex] && !newerPost;
        newerIndex--
      ) {
        if (!posts[newerIndex].draft) {
          newerPost = posts[newerIndex];
        }
      }
    }

    if (!post.draft) {
      for (
        let olderIndex = i + 1;
        olderIndex < postsCount && posts[olderIndex] && !olderPost;
        olderIndex++
      ) {
        if (!posts[olderIndex].draft) {
          olderPost = posts[olderIndex];
        }
      }
    }

    return {
      id: post.id,
      slug: post.slug,
      draft: post.draft,
      url,
      title,
      text: post.text,
      created: new Date(parseInt(post.created)).toISOString(),
      createdUTC: new Date(parseInt(post.created)).toUTCString(),
      newer: newerPost && { id: newerPost.id, url: getPostUrl(newerPost) },
      older: olderPost && { id: olderPost.id, url: getPostUrl(olderPost) },
      imported
    };
  });

  console.log("post preparation done");

  const progressPadding = Math.log10(postsCount) + 1;
  let i = 0;

  process.stdout.write("");

  for (const postsChunk of chunk(preparedPosts, 16)) {
    i = i + postsChunk.length;
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(
      `${postsChunk[0].created.slice(0, 4)} ${i
        .toString()
        .padStart(progressPadding)}/${postsCount} ${"#".repeat(
        parseInt(i * 50 / postsCount)
      )}${".".repeat(parseInt((postsCount - i) * 50 / postsCount))}`
    );

    await Promise.all(
      postsChunk.map(async post => {
        post.html = marked(
          post.text.replace(/¯\\_\(ツ\)_\/¯/g, "¯\\\\\\_(ツ)\\_/¯")
        );

        const renderedPage = await render("./templates/post.mustache", {
          blog: {
            title: BLOG_TITLE,
            url: BLOG_BASE_URL + "/index.html"
          },
          feed: {
            description: `Everything feed - ${BLOG_TITLE}`,
            url: BLOG_BASE_URL + "/rss.xml"
          },
          title: post.title,
          post,
          url: post.url,
          older: post.older
            ? {
                text: postTitles[post.older.id] || post.older.id,
                url: post.older.url
              }
            : null,
          newer: post.newer
            ? {
                text: postTitles[post.newer.id] || post.newer.id,
                url: post.newer.url
              }
            : null
        });

        if (!post.draft && post.slug) {
          await fs.writeFile(`${tmpFolder}/${post.slug}.html`, renderedPage);
        }

        return fs.writeFile(`${tmpFolder}/${post.id}.html`, renderedPage);
      })
    );
  }

  process.stdout.write("\n");
  console.log("posts done");

  const PAGE_SIZE = 20;

  const publicPosts = preparedPosts.filter(p => !p.draft);

  if (publicPosts.length % PAGE_SIZE) {
    for (let i = 0; i < publicPosts.length % PAGE_SIZE; i++) {
      publicPosts.unshift(null);
    }
  }

  const pagination = chunk(publicPosts, PAGE_SIZE);

  pagination[0] = pagination[0].filter(Boolean);

  let pageNumber = pagination.length;
  for (const page of pagination) {
    const url = `page-${pageNumber}.html`;
    const title = `page-${pageNumber}`;

    await fs.writeFile(
      `${tmpFolder}/${url}`,
      await render("./templates/list.mustache", {
        blog: {
          title: BLOG_TITLE,
          url: BLOG_BASE_URL + "/index.html"
        },
        feed: {
          description: `Everything feed - ${BLOG_TITLE}`,
          url: BLOG_BASE_URL + "/rss.xml"
        },
        title: title,
        url: url,
        posts: page,
        newer:
          pageNumber < pagination.length - 1
            ? {
                text: `page-${pageNumber + 1}`,
                url: `${BLOG_BASE_URL}/page-${pageNumber + 1}.html`
              }
            : { text: `index`, url: `${BLOG_BASE_URL}/index.html` },
        older:
          pageNumber > 1
            ? {
                text: `page-${pageNumber - 1}`,
                url: `${BLOG_BASE_URL}/page-${pageNumber - 1}.html`
              }
            : null
      })
    );

    pageNumber = pageNumber - 1;
  }

  console.log("pagination done");

  let indexPage;
  let olderPage;

  if (pagination[0].length < 10) {
    indexPage = pagination[0].concat(pagination[1]);
    olderPage = {
      text: `page-${pagination.length - 2}`,
      url: `${BLOG_BASE_URL}/page-${pagination.length - 2}.html`
    };
  } else {
    indexPage = pagination[0];
    olderPage = {
      text: `page-${pagination.length - 1}`,
      url: `${BLOG_BASE_URL}/page-${pagination.length - 1}.html`
    };
  }

  await fs.writeFile(
    `${tmpFolder}/index.html`,
    await render("./templates/list.mustache", {
      blog: {
        title: BLOG_TITLE,
        url: BLOG_BASE_URL + "/index.html"
      },
      feed: {
        description: `Everything feed - ${BLOG_TITLE}`,
        url: BLOG_BASE_URL + "/rss.xml"
      },
      posts: indexPage,
      newer: null,
      older: olderPage,
      index: true
    })
  );

  const feedPosts = indexPage.slice(0, PAGE_SIZE);

  await fs.writeFile(
    `${tmpFolder}/rss.xml`,
    await render("./templates/rss.mustache", {
      blog: {
        title: BLOG_TITLE,
        url: BLOG_BASE_URL + "/index.html"
      },
      feed: {
        pubDate: new Date(
          Math.max.apply(null, feedPosts.map(p => new Date(p.created)))
        ).toUTCString(),
        description: `Everything feed - ${BLOG_TITLE}`,
        url: BLOG_BASE_URL + "/rss.xml"
      },
      posts: feedPosts
    })
  );

  const groupByMonth = groupBy(
    pagination.map((v, i) => ({
      month: v[0].created.match(/^\d{4}-\d{2}/)[0],
      text: pagination.length - i,
      url: `./page-${pagination.length - i}.html`
    })),
    v => v.month
  );
  const monthGroups = Object.keys(groupByMonth).sort((a, b) => {
    return a > b ? -1 : 1;
  });

  await fs.writeFile(
    `${tmpFolder}/archive.html`,
    await render("./templates/archive.mustache", {
      blog: {
        title: BLOG_TITLE,
        url: BLOG_BASE_URL + "/index.html"
      },
      feed: {
        description: `Everything feed - ${BLOG_TITLE}`,
        url: BLOG_BASE_URL + "/rss.xml"
      },
      title: "archive",
      url: "./archive.html",
      months: monthGroups.map(month => ({
        month,
        pages: groupByMonth[month]
      }))
    })
  );

  console.log("archive done");

  const media = await db.all("SELECT * from media");

  for (const mediaChunk of chunk(media, 16)) {
    await Promise.all(
      mediaChunk.map(async m =>
        fs.writeFile(path.join(tmpFolder, "media", `${m.id}.${m.ext}`), m.data)
      )
    );
  }

  console.log("media done");

  await new Promise((resolve, reject) => {
    const rsync = new Rsync()
      .set("progress")
      .set("delete")
      .set("dirs")
      .flags("Icu")
      .source(tmpFolder + path.sep)
      .destination(process.env.DIST || "dist");

    rsync.execute(
      function(error) {
        if (error) {
          return reject(error);
        }

        return resolve();
      },
      d => console.log(d.toString()),
      d => console.error(d.toString())
    );
  });

  rmrf(tmpFolder);
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
