const path = require("path");

const chunk = require("lodash.chunk");
const groupBy = require("lodash.groupby");

const {
  DIST,
  BLOG_BASE_URL,
  BLOG_TITLE,
  PAGE_SIZE,
  MINIMUM_INDEX_PAGE_SIZE,
  render,
  prepare,
  writeFileWithGzip,
  unlinkFileWithGzip
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

  query = query + `ORDER BY datetime(created) DESC, id DESC `;

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

  await unlinkFileWithGzip(postIdPagePath);

  if (post.slug) {
    const postSlugPagePath = path.resolve(DIST, `${post.slug}.html`);

    await unlinkFileWithGzip(postSlugPagePath);
  }
}

async function generatePostPage(post) {
  return await render("./templates/post.mustache", {
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
}

async function removePotentialPagination(newestPage) {
  const pagePath = path.resolve(DIST, `page-${newestPage.index + 1}.html`);

  await unlinkFileWithGzip(pagePath);
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

  return await render("./templates/list.mustache", {
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
  });
}

async function generateIndexPage(db, newestPage) {
  let indexPostsLimit = newestPage.posts.length;
  let olderPageIndex = Math.max(0, newestPage.index - 1);

  if (newestPage.posts.length < MINIMUM_INDEX_PAGE_SIZE) {
    indexPostsLimit = newestPage.posts.length + PAGE_SIZE;
    olderPageIndex = Math.max(0, newestPage.index - 2);
  }

  const posts = await getPosts(
    db,
    {},
    "draft = 0 AND private = 0",
    indexPostsLimit
  );

  return await render("./templates/list.mustache", {
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
    older: olderPageIndex
      ? {
          text: `page-${olderPageIndex}`,
          url: `${BLOG_BASE_URL}/page-${olderPageIndex}.html`
        }
      : null,
    index: true
  });
}

async function generateArchivePage(db) {
  let postMonths = await db.all(`
    SELECT strftime('%Y-%m', created) month
    FROM posts
    WHERE draft = 0 AND private = 0
    ORDER BY datetime(created) DESC, id DESC
  `);

  if (postMonths.length % PAGE_SIZE) {
    for (let i = 0; i < postMonths.length % PAGE_SIZE; i++) {
      postMonths.unshift(null);
    }
  }

  const pages = chunk(postMonths, PAGE_SIZE);
  if (pages.length) {
    pages[0] = pages[0].filter(Boolean);
  }

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

  return await render("./templates/archive.mustache", {
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
  });
}

async function generateRSSPage(db) {
  const posts = await getPosts(db, {}, "draft = 0 AND private = 0", PAGE_SIZE);

  return await render("./templates/rss.mustache", {
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
  });
}

async function getPagination(db, postsCreatedAfter) {
  let query = `
    SELECT id
    FROM posts
    WHERE draft = 0 AND private = 0
    ORDER BY datetime(created) DESC, id DESC
  `;
  let params = [];
  let paginationOffset = 0;

  if (postsCreatedAfter) {
    const totalPostCount = (await db.get(
      `SELECT count(*) as c FROM posts WHERE draft = 0 AND private = 0`
    )).c;

    const postsAfterCurrentCount =
      (await db.get(
        `
          SELECT count(*) as c FROM posts
          WHERE draft = 0 AND private = 0 AND datetime(created) >= datetime(?1)
        `,
        { 1: postsCreatedAfter }
      )).c || 1;

    const postsCountOnAffectedPages =
      postsAfterCurrentCount +
      ((totalPostCount - postsAfterCurrentCount) % PAGE_SIZE);

    query = query + ` LIMIT ?1 `;
    params = { 1: postsCountOnAffectedPages };
    paginationOffset = (totalPostCount - postsCountOnAffectedPages) / PAGE_SIZE;
  }

  const posts = await db.all(query, params);

  if (posts.length % PAGE_SIZE) {
    for (let i = 0; i < posts.length % PAGE_SIZE; i++) {
      posts.unshift(null);
    }
  }

  const pagination = chunk(posts, PAGE_SIZE).map((page, i, arr) => ({
    posts: page.filter(Boolean).map(p => p.id),
    index: arr.length - i + paginationOffset
  }));

  return pagination;
}

async function generateAfterEdit(db, postId, oldStatus, oldCreated) {
  const post = await getPost(db, postId);
  const newStatus = post.status;
  const newCreated = post.created;

  if (newStatus === "draft") {
    await removePostPage(post);
  } else {
    const renderedPage = await generatePostPage(post);

    if (post.slug && post.id !== post.slug) {
      await writeFileWithGzip(
        path.resolve(DIST, `${post.slug}.html`),
        renderedPage
      );
    }

    await writeFileWithGzip(
      path.resolve(DIST, `${post.id}.html`),
      renderedPage
    );
  }

  if (oldStatus === "public" || newStatus === "public") {
    const pages = await getPagination(
      db,
      oldCreated
        ? new Date(Math.min(oldCreated, new Date(post.created)))
            .toISOString()
            .replace(/\.\d{3}Z$/, "Z")
        : post.created
    );

    const newestPage = pages[0] || { index: 0, posts: [] };

    await removePotentialPagination(newestPage);

    await writeFileWithGzip(
      path.resolve(DIST, "index.html"),
      await generateIndexPage(db, newestPage)
    );

    if (pages.length <= 2) {
      await writeFileWithGzip(
        path.resolve(DIST, "rss.xml"),
        await generateRSSPage(db)
      );
    }

    if (oldStatus === newStatus && +oldCreated === +new Date(newCreated)) {
      const postPaginationPage = pages.slice(-1)[0];
      const pageNumber = postPaginationPage.index;

      await writeFileWithGzip(
        path.resolve(DIST, `page-${pageNumber}.html`),
        await generatePaginationPage(
          db,
          postPaginationPage.index,
          postPaginationPage.posts,
          newestPage.index === postPaginationPage.index
        )
      );
    } else {
      for (const page of pages) {
        const pageNumber = page.index;

        await writeFileWithGzip(
          path.resolve(DIST, `page-${pageNumber}.html`),
          await generatePaginationPage(
            db,
            pageNumber,
            page.posts,
            newestPage.index === pageNumber
          )
        );
      }

      await writeFileWithGzip(
        path.resolve(DIST, "archive.html"),
        await generateArchivePage(db)
      );
    }
  }
}

module.exports = {
  getPosts,
  generateAfterEdit,
  generatePostPage,
  getPagination,
  generatePaginationPage,
  generateArchivePage,
  generateIndexPage,
  generateRSSPage
};
