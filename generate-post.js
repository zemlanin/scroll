const path = require("path");
const { promisify } = require("util");

const fs = require("fs");
const fsPromises = {
  access: promisify(fs.access),
  unlink: promisify(fs.unlink),
  writeFile: promisify(fs.writeFile)
};

const chunk = require("lodash.chunk");
const groupBy = require("lodash.groupby");

const {
  DIST,
  BLOG_BASE_URL,
  BLOG_TITLE,
  PAGE_SIZE,
  MINIMUM_INDEX_PAGE_SIZE,
  render,
  prepare
} = require("./common.js");

function getPostsQuery(where, limit) {
  let query = `
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
  `;

  if (where) {
    query = query + `WHERE ${where} `;
  }

  query = query + `ORDER BY created DESC, modified DESC, id DESC `;

  if (limit) {
    query = query + `LIMIT ${limit} `;
  }

  return query;
}

async function getPosts(db, params, where, limit) {
  return (await db.all(getPostsQuery(where, limit), params)).map(prepare);
}

async function getPost(db, postId) {
  return prepare(await db.get(getPostsQuery(`id = ?1`), { 1: postId }));
}

async function removePostPage(post) {
  const postIdPagePath = path.resolve(DIST, `${post.id}.html`);

  try {
    await fsPromises.access(postIdPagePath);
    await fsPromises.unlink(postIdPagePath);
  } catch (e) {
    //
  }

  if (post.slug) {
    const postSlugPagePath = path.resolve(DIST, `${post.slug}.html`);

    try {
      await fsPromises.access(postSlugPagePath);
      await fsPromises.unlink(postSlugPagePath);
    } catch (e) {
      //
    }
  }
}

async function generatePostPage(post) {
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
    await fsPromises.writeFile(
      path.resolve(DIST, `${post.slug}.html`),
      renderedPage
    );
  }

  return fsPromises.writeFile(
    path.resolve(DIST, `${post.id}.html`),
    renderedPage
  );
}

async function removePotentialPagination(newestPage) {
  const pagePath = path.resolve(DIST, `page-${newestPage.index + 1}.html`);

  try {
    await fsPromises.access(pagePath);
    await fsPromises.unlink(pagePath);
  } catch (e) {
    //
  }
}

async function generatePaginationPage(db, pageNumber, postIds, isNewest) {
  const posts = await getPosts(
    db,
    postIds,
    `id IN (${postIds.map(() => "?").join(", ")})`,
    postIds.length
  );

  const url = `page-${pageNumber}.html`;
  const title = `page-${pageNumber}`;

  await fsPromises.writeFile(
    path.resolve(DIST, url),
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
      posts: posts,
      newer: isNewest
        ? { text: `index`, url: `${BLOG_BASE_URL}/` }
        : {
            text: `page-${pageNumber + 1}`,
            url: `${BLOG_BASE_URL}/page-${pageNumber + 1}.html`
          },
      older:
        pageNumber > 1
          ? {
              text: `page-${pageNumber - 1}`,
              url: `${BLOG_BASE_URL}/page-${pageNumber - 1}.html`
            }
          : null
    })
  );
}

async function generateIndexPage(db, newestPage) {
  let indexPostsLimit = newestPage.posts.length;
  let olderPageIndex = newestPage.index - 1;

  if (newestPage.posts.length < MINIMUM_INDEX_PAGE_SIZE) {
    indexPostsLimit = newestPage.posts.length + PAGE_SIZE;
    olderPageIndex = newestPage.index - 2;
  }

  const posts = await getPosts(
    db,
    {},
    "draft = 0 AND private = 0",
    indexPostsLimit
  );

  await fsPromises.writeFile(
    path.resolve(DIST, "index.html"),
    await render("./templates/list.mustache", {
      blog: {
        title: BLOG_TITLE,
        url: BLOG_BASE_URL + "/"
      },
      feed: {
        description: `Everything feed - ${BLOG_TITLE}`,
        url: BLOG_BASE_URL + "/rss.xml"
      },
      posts: posts,
      newer: null,
      older: {
        text: `page-${olderPageIndex}`,
        url: `${BLOG_BASE_URL}/page-${olderPageIndex}.html`
      },
      index: true
    })
  );
}

async function generateArchivePage(db) {
  let postMonths = await db.all(`
    SELECT strftime('%Y-%m', created) month
    FROM posts
    WHERE draft = 0 AND private = 0
    ORDER BY created DESC, modified DESC, id DESC
  `);

  if (postMonths.length % PAGE_SIZE) {
    for (let i = 0; i < postMonths.length % PAGE_SIZE; i++) {
      postMonths.unshift(null);
    }
  }

  const pages = chunk(postMonths, PAGE_SIZE);
  pages[0] = pages[0].filter(Boolean);

  const groupByMonth = groupBy(
    pages.map((v, i) => ({
      month: v[0].month,
      text: pages.length - i,
      url: `./page-${pages.length - i}.html`
    })),
    v => v.month
  );
  const monthGroups = Object.keys(groupByMonth).sort((a, b) => {
    return a > b ? -1 : 1;
  });

  await fsPromises.writeFile(
    path.resolve(DIST, "archive.html"),
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
    })
  );
}

async function generateRSSPage(db) {
  const posts = await getPosts(db, {}, "draft = 0 AND private = 0", PAGE_SIZE);

  await fsPromises.writeFile(
    path.resolve(DIST, "rss.xml"),
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
      posts: posts
    })
  );
}

async function getAffectedPages(db, postCreated) {
  const totalPostCount = (await db.get(
    `
      SELECT count(*) as c
      FROM posts
      WHERE draft = 0 AND private = 0
    `
  )).c;

  const postsAfterCurrentCount =
    (await db.get(
      `
        SELECT count(*) as c
        FROM posts
        WHERE draft = 0 AND private = 0 AND created >= ?1
      `,
      { 1: postCreated }
    )).c || 1;

  const postsCountOnAffectedPages =
    postsAfterCurrentCount +
    ((totalPostCount - postsAfterCurrentCount) % PAGE_SIZE);

  const inaffectedPages =
    (totalPostCount - postsCountOnAffectedPages) / PAGE_SIZE;

  const postsOnAffectedPages = await db.all(
    `
      SELECT id
      FROM posts
      WHERE draft = 0 AND private = 0
      ORDER BY created DESC, modified DESC, id DESC
      LIMIT ?2
    `,
    {
      2: postsCountOnAffectedPages
    }
  );

  if (postsOnAffectedPages.length % PAGE_SIZE) {
    for (let i = 0; i < postsOnAffectedPages.length % PAGE_SIZE; i++) {
      postsOnAffectedPages.unshift(null);
    }
  }

  const pagination = chunk(postsOnAffectedPages, PAGE_SIZE).map(
    (page, i, arr) => ({
      posts: page.filter(Boolean).map(p => p.id),
      index: arr.length - i + inaffectedPages
    })
  );

  return pagination;
}

async function generateAfterEdit(db, postId, oldStatus) {
  const post = await getPost(db, postId);
  const newStatus = post.status;

  if (newStatus === "draft") {
    await removePostPage(post);
  } else {
    await generatePostPage(post);
  }

  if (oldStatus === "public" || newStatus === "public") {
    const pages = await getAffectedPages(db, post.created);

    const newestPage = pages[0];

    await removePotentialPagination(newestPage);

    await generateIndexPage(db, newestPage);

    if (pages.length <= 2) {
      await generateRSSPage(db);
    }

    if (oldStatus === newStatus) {
      const postPaginationPage = pages.slice(-1)[0];

      await generatePaginationPage(
        db,
        postPaginationPage.index,
        postPaginationPage.posts,
        newestPage.index === postPaginationPage.index
      );
    } else {
      for (const page of pages) {
        await generatePaginationPage(
          db,
          page.index,
          page.posts,
          newestPage.index === page.index
        );
      }

      await generateArchivePage(db);
    }
  }
}

module.exports = {
  generateAfterEdit
};
