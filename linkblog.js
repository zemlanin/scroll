require("dotenv").config();

const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");
const fetchModule = import("node-fetch");
const FeedParser = require("feedparser");

const {
  DIST,
  RSS_SIZE,
  POSTS_DB,
  ACTIVITYSTREAMS_DB,
  LINKLIST_SOURCE_FEED,
  loadIcu,
  embedCallback,
  getLinkId,
  getBlogObject,
} = require("./common.js");
const { render } = require("./render.js");
const EmbedsLoader = require("./embeds-loader.js");

const RETRY_TIMEOUT = 1000 * 60 * 30; // 30 minutes

async function loadFreshFeed(db, stdout, _stderr) {
  const feedparser = new FeedParser({ normalize: true });

  const { default: fetch } = await fetchModule;
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
          INSERT INTO linklist
          (id, source_id, original_url, created)
          VALUES ($1, $2, $3, $4)
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

async function prepareLink(link, embedsLoader, options) {
  const created = new Date(parseInt(link.created));

  return {
    ...link,
    url: link.original_url,
    created: created.toISOString().replace(/\.\d{3}Z$/, "Z"),
    createdDate: created.toISOString().split("T")[0],
    createdUTC: created.toUTCString(),
    html: await embedsLoader.load(
      `<p>${embedCallback(link.original_url)}</p>`,
      {
        externalFrames: options && options.externalFrames,
        maxWidth: options && options.maxWidth,
      }
    ),
    title: (await embedsLoader.query([link.original_url]))[0].title,
  };
}

async function generateLinkblogPage(db, blog) {
  const rawLinks = await db.all(
    `
      SELECT id, strftime('%s000', created) created, original_url
      FROM linklist
      WHERE private = 0
      ORDER BY created DESC
      LIMIT ?1;
    `,
    {
      1: RSS_SIZE,
    }
  );

  const embedsLoader = new EmbedsLoader(db);

  const links = [];

  for (const l of rawLinks) {
    links.push(await prepareLink(l, embedsLoader));
  }

  return await render("linkblog.mustache", {
    blog,
    linkblog: true,
    url: "./linkblog.html",
    links,
  });
}

async function generateLinkblogRSSPage(db, blog) {
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
    const entry = await prepareLink(l, embedsLoader, {
      externalFrames: true,
      maxWidth: 720,
    });
    entry.html += `<p><a href="${blog.linkblog.url}">via</a></p>`;
    links.push(entry);
  }

  return await render("rss-linkblog.mustache", {
    blog,
    links,
    pubDate: new Date().toUTCString(),
  });
}

async function generateLinkblogSection(db, blog) {
  const rawLinks = await db.all(`
    SELECT id, strftime('%s000', created) created, original_url
    FROM linklist
    WHERE private = 0
    ORDER BY created DESC
    LIMIT 20;
  `);

  const embedsLoader = new EmbedsLoader(db);
  const embeds = await embedsLoader.query(rawLinks.map((l) => l.original_url));
  const blogHostname = new URL(blog.url).hostname;

  return embeds
    .map((card, i) => ({ ...card, id: rawLinks[i].id }))
    .filter((card) => card.title && card.img)
    .filter((card) => new URL(card.url).hostname !== blogHostname)
    .map((card) => ({
      id: card.id,
      url: card.url,
      title: card.title,
      site_name:
        card.site_name && !card.title.endsWith(card.site_name)
          ? card.site_name
          : "",
      img: card.img,
    }))
    .slice(0, 4);
}

async function checkAndUpdate(stdout, stderr) {
  if (!LINKLIST_SOURCE_FEED) {
    return;
  }

  const db = await sqlite
    .open({ filename: POSTS_DB, driver: sqlite3.Database })
    .then(loadIcu);

  const asdb = await sqlite.open({
    filename: ACTIVITYSTREAMS_DB,
    driver: sqlite3.Database,
  });

  const hasNewItems = await loadFreshFeed(
    db,
    stdout || process.stdout,
    stderr || process.stderr
  );

  if (hasNewItems) {
    await require("./generate.js").generate(
      db,
      asdb,
      DIST,
      stdout || process.stdout,
      stderr || process.stderr,
      { only: new Set(["linkblog"]) }
    );

    await notifyWebSub();
  }
}

async function notifyWebSub() {
  const { default: fetch } = await fetchModule;

  const { linkblog } = await getBlogObject();
  const { feed } = linkblog;

  if (!feed.websub) {
    return;
  }

  try {
    await fetch(feed.websub, {
      method: "post",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "hub.mode": "publish",
        "hub.url": feed.url,
      }).toString(),
    });
  } catch (e) {
    console.error(e);
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
  generateLinkblogPage,
  generateLinkblogRSSPage,
  generateLinkblogSection,
  getLinkId,
  notifyWebSub,
};

if (require.main === module) {
  checkAndUpdate();
}
