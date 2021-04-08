require("dotenv").config();

const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");
const fetch = require("node-fetch");
const FeedParser = require("feedparser");

const _id = require("nanoid/generate");
const getLinkId = () =>
  `link-${new Date().getFullYear()}-${(new Date().getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${_id(
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    10
  )}`;

const {
  DIST,
  POSTS_DB,
  LINKLIST_SOURCE_FEED,
  loadIcu,
  embedCallback,
} = require("./common.js");
const { render } = require("./render.js");
const EmbedsLoader = require("./embeds-loader.js");

const RETRY_TIMEOUT = 1000 * 60 * 30; // 30 minutes

async function loadFreshFeed(db, stdout, _stderr) {
  const feedparser = new FeedParser({ normalize: true });

  const res = await fetch(LINKLIST_SOURCE_FEED);

  if (res.status !== 200) {
    throw new Error("Bad status code");
  } else {
    res.body.pipe(feedparser);
  }

  const feed = await new Promise((resolve, reject) => {
    let meta;
    const items = [];
    feedparser.on("error", function (error) {
      reject(error);
    });

    feedparser.on("readable", function () {
      const stream = this;
      meta = stream.meta;
      let item;

      while ((item = stream.read())) {
        // eslint-disable-line no-cond-assign
        items.push(item);
      }
    });

    feedparser.on("end", function () {
      resolve({ meta, items });
    });
  });

  let hasNewItems = false;

  for (const item of feed.items) {
    const exists = await db.get(
      `SELECT id FROM linklist WHERE source_id = $1 LIMIT 1`,
      { 1: item.guid }
    );

    if (!exists) {
      hasNewItems = true;

      stdout.write(`new link item: ${item.link}\n`);

      await db.run(
        `
          INSERT INTO linklist (id, source_id, original_url, created) VALUES ($1, $2, $3, $4)
        `,
        {
          1: getLinkId(),
          2: item.guid,
          3: item.link,
          4: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        }
      );
    }
  }

  return hasNewItems;
}

async function prepareLink(link, embedsLoader) {
  const created = new Date(parseInt(link.created));

  return {
    ...link,
    url: link.original_url,
    created: created.toISOString().replace(/\.\d{3}Z$/, "Z"),
    createdDate: created.toISOString().split("T")[0],
    createdUTC: created.toUTCString(),
    html: await embedsLoader.load(embedCallback(link.original_url)),
    title: (await embedsLoader.query([link.original_url]))[0].title,
  };
}

async function generateLinklistPage(db, blog) {
  const rawLinks = await db.all(`
    SELECT id, strftime('%s000', created) created, original_url
    FROM linklist
    WHERE private = 0
    ORDER BY created DESC
    LIMIT 20;
  `);

  const embedsLoader = new EmbedsLoader(db);

  const links = [];

  for (const l of rawLinks) {
    links.push(await prepareLink(l, embedsLoader));
  }

  return await render("linklist.mustache", {
    blog,
    linklist: true,
    url: "./linklist.html",
    links,
  });
}

async function generateLinklistRSSPage(db, blog) {
  const rawLinks = await db.all(`
    SELECT id, strftime('%s000', created) created, original_url
    FROM linklist
    WHERE private = 0
    ORDER BY created DESC
    LIMIT 20;
  `);

  const embedsLoader = new EmbedsLoader(db);

  const links = [];

  for (const l of rawLinks) {
    const entry = await prepareLink(l, embedsLoader);
    entry.html += `<a href="${blog.linklist.url}">via</a>`;
    links.push(entry);
  }

  return await render("linklist-rss.mustache", {
    blog,
    links,
    pubDate: new Date().toUTCString(),
  });
}

async function checkAndUpdate(stdout, stderr) {
  if (!LINKLIST_SOURCE_FEED) {
    return;
  }

  const db = await sqlite
    .open({ filename: POSTS_DB, driver: sqlite3.Database })
    .then(loadIcu);

  const hasNewItems = await loadFreshFeed(
    db,
    stdout || process.stdout,
    stderr || process.stderr
  );

  if (hasNewItems) {
    await require("./generate.js").generate(
      db,
      DIST,
      stdout || process.stdout,
      stderr || process.stderr,
      { only: new Set(["linklist"]) }
    );
  }
}

function watch() {
  if (!LINKLIST_SOURCE_FEED) {
    return;
  }

  checkAndUpdate()
    .then(() => setTimeout(watch, RETRY_TIMEOUT))
    .catch(() => setTimeout(watch, RETRY_TIMEOUT * (Math.random() + 1)));
}

module.exports = {
  watch,
  checkAndUpdate,
  generateLinklistPage,
  generateLinklistRSSPage,
};

if (require.main === module) {
  checkAndUpdate();
}
