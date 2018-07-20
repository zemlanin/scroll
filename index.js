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
const groupBy = require("lodash.groupby");
const chunk = require("lodash.chunk");
const Rsync = require("rsync");

const {
  BLOG_TITLE,
  BLOG_BASE_URL,
  PAGE_SIZE,
  MINIMUM_INDEX_PAGE_SIZE,
  prepare,
  render
} = require("./common.js");

const rmrf = require("./rmrf.js");

async function generate(stdout, stderr) {
  const tmpFolder = await fs.mkdtemp(path.join(os.tmpdir(), "scroll-"));
  await fs.mkdir(path.join(tmpFolder, "/media"));

  stdout.write(`made tmp dir: ${tmpFolder}\n`);

  const db = await sqlite.open(path.resolve(__dirname, "posts.db"));

  let posts = await db.all(`
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
    WHERE draft = 0
    ORDER BY created DESC
  `);
  // const posts = await db.all(`SELECT * from posts WHERE id LIKE "tumblr%" ORDER BY created DESC`);

  stdout.write(`loaded posts from db\n`);

  const postsCount = posts.length;
  let preparedPosts = posts.map(prepare);

  posts = null;

  stdout.write("post preparation done\n");

  const progressPadding = Math.log10(postsCount) + 1;
  let i = 0;

  if (stdout.clearLine && stdout.cursorTo) {
    stdout.write("");
  } else {
    stdout.write(`${postsCount} => `);
  }

  for (const postsChunk of chunk(preparedPosts, 16)) {
    i = i + postsChunk.length;

    if (stdout.clearLine && stdout.cursorTo) {
      stdout.clearLine();
      stdout.cursorTo(0);
      stdout.write(
        `${postsChunk[0].created.slice(0, 4)} ${i
          .toString()
          .padStart(progressPadding)}/${postsCount} ${"#".repeat(
          parseInt(i * 50 / postsCount)
        )}${".".repeat(parseInt((postsCount - i) * 50 / postsCount))}`
      );
    } else {
      stdout.write(postsChunk[0].created.slice(3, 4));
    }

    await Promise.all(
      postsChunk.map(async post => {

        const renderedPage = await render("./templates/post.mustache", {
          blog: {
            title: BLOG_TITLE,
            url: BLOG_BASE_URL + "/"
          },
          feed: {
            description: `Everything feed - ${BLOG_TITLE}`,
            url: BLOG_BASE_URL + "/rss.xml"
          },
          title: post.title,
          post,
          url: post.url,
          older: null,
          newer: null
        });

        if (post.slug && post.id !== post.slug) {
          await fs.writeFile(`${tmpFolder}/${post.slug}.html`, renderedPage, {
            flag: "wx"
          });
        }

        return fs.writeFile(`${tmpFolder}/${post.id}.html`, renderedPage, {
          flag: "wx"
        });
      })
    );
  }

  stdout.write("\n");
  stdout.write("posts done\n");

  const publicPosts = preparedPosts.filter(p => p.public);

  if (publicPosts.length % PAGE_SIZE) {
    for (let i = 0; i < publicPosts.length % PAGE_SIZE; i++) {
      publicPosts.unshift(null);
    }
  }

  let pagination = chunk(publicPosts, PAGE_SIZE);

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
          url: BLOG_BASE_URL + "/"
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
            : { text: `index`, url: `${BLOG_BASE_URL}/` },
        older:
          pageNumber > 1
            ? {
                text: `page-${pageNumber - 1}`,
                url: `${BLOG_BASE_URL}/page-${pageNumber - 1}.html`
              }
            : null
      }),
      { flag: "wx" }
    );

    pageNumber = pageNumber - 1;
  }

  stdout.write("pagination done\n");

  let indexPage;
  let olderPage;

  if (pagination[0].length < MINIMUM_INDEX_PAGE_SIZE) {
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
        url: BLOG_BASE_URL + "/"
      },
      feed: {
        description: `Everything feed - ${BLOG_TITLE}`,
        url: BLOG_BASE_URL + "/rss.xml"
      },
      posts: indexPage,
      newer: null,
      older: olderPage,
      index: true
    }),
    { flag: "wx" }
  );

  const feedPosts = pagination[0].concat(pagination[1]).slice(0, PAGE_SIZE);

  await fs.writeFile(
    `${tmpFolder}/rss.xml`,
    await render("./templates/rss.mustache", {
      blog: {
        title: BLOG_TITLE,
        url: BLOG_BASE_URL + "/"
      },
      feed: {
        pubDate: new Date().toUTCString(),
        description: `Everything feed - ${BLOG_TITLE}`,
        url: BLOG_BASE_URL + "/rss.xml"
      },
      posts: feedPosts
    }),
    { flag: "wx" }
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
        url: BLOG_BASE_URL + "/"
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
    }),
    { flag: "wx" }
  );

  stdout.write("archive done\n");

  preparedPosts = null;
  pagination = null;

  const media = await db.all("SELECT id from media");

  for (const mediaChunk of chunk(media, 16)) {
    await db
      .all(
        `SELECT * from media WHERE id IN (${mediaChunk
          .map(s => `"${s.id}"`)
          .join(",")})`
      )
      .then(loaded =>
        Promise.all(
          loaded.map(async m =>
            fs.writeFile(
              path.join(tmpFolder, "media", `${m.id}.${m.ext}`),
              m.data
            )
          )
        )
      );
  }

  stdout.write("media done\n");

  await new Promise((resolve, reject) => {
    const rsync = new Rsync()
      .set("progress")
      .set("delete")
      .flags("Icru")
      .source(tmpFolder + path.sep)
      .destination(process.env.DIST || "dist");

    rsync.execute(
      function(error) {
        if (error) {
          return reject(error);
        }

        return resolve();
      },
      d => stdout.write(d.toString() + "\n"),
      d => stderr.write(d.toString() + "\n")
    );
  });

  rmrf(tmpFolder);
}

if (require.main === module) {
  generate(process.stdout, process.stderr)
    .then(() => {
      console.log("done");
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
} else {
  module.exports = generate;
}
