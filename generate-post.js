const url = require("url");
const path = require("path");

const chunk = require("lodash.chunk");
const groupBy = require("lodash.groupby");

const {
  DIST,
  PAGE_SIZE,
  MINIMUM_INDEX_PAGE_SIZE,
  prepare,
  getBlogObject,
  writeFileWithGzip,
  unlinkFileWithGzip,
} = require("./common.js");
const { render } = require("./render.js");
const EmbedsLoader = require("./embeds-loader.js");

function getPostsQuery(where, limit) {
  let query = `
    SELECT
      id,
      slug,
      draft,
      internal,
      private,
      (NOT draft AND NOT internal AND NOT private) public,
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
  const embedsLoader = new EmbedsLoader(db);

  return Promise.all(
    (await db.all(getPostsQuery(where, limit), params)).map((row) =>
      prepare(row, embedsLoader)
    )
  );
}

async function getPost(db, postId) {
  const embedsLoader = new EmbedsLoader(db);
  return await prepare(
    await db.get(getPostsQuery(`id = ?1`), { 1: postId }),
    embedsLoader
  );
}

async function generatePostPage(post, blog) {
  return await render("post.mustache", {
    blog: blog,
    title: post.title,
    post,
    url: post.url,
    older: null,
    newer: null,
  });
}

async function removePotentialPagination(newestPage) {
  const pagePath = path.join(DIST, `page-${newestPage.index + 1}.html`);

  await unlinkFileWithGzip(pagePath);
}

async function generatePaginationPage(
  db,
  blog,
  pageNumber,
  postIds,
  newestPage
) {
  const posts = await getPosts(
    db,
    postIds,
    `id IN (${postIds.map(() => "?").join(", ")})`,
    postIds.length
  );

  const pageUrl = `page-${pageNumber}.html`;
  const title = `page-${pageNumber}`;

  const indexPageAsNewer =
    newestPage.index === pageNumber ||
    newestPage.index === pageNumber + 1 ||
    (newestPage.index === pageNumber + 2 &&
      newestPage.posts.length < MINIMUM_INDEX_PAGE_SIZE);

  return await render("list.mustache", {
    blog,
    title: title,
    url: pageUrl,
    posts: posts,
    newer: indexPageAsNewer
      ? { text: `index`, url: blog.url }
      : {
          text: `page-${pageNumber + 1}`,
          url: url.resolve(blog.url, `page-${pageNumber + 1}.html`),
        },
    older:
      pageNumber > 1
        ? {
            text: `page-${pageNumber - 1}`,
            url: url.resolve(blog.url, `page-${pageNumber - 1}.html`),
          }
        : null,
  });
}

async function generateIndexPage(db, blog, newestPage) {
  let indexPostsLimit = newestPage.posts.length;
  let olderPageIndex = Math.max(0, newestPage.index - 1);

  if (newestPage.posts.length < MINIMUM_INDEX_PAGE_SIZE) {
    indexPostsLimit = newestPage.posts.length + PAGE_SIZE;
    olderPageIndex = Math.max(0, newestPage.index - 2);
  }

  const posts = await getPosts(
    db,
    {},
    "draft = 0 AND internal = 0 AND private = 0",
    indexPostsLimit
  );

  return await render("list.mustache", {
    blog,
    posts: posts,
    newer: null,
    older: olderPageIndex
      ? {
          text: `page-${olderPageIndex}`,
          url: url.resolve(blog.url, `page-${olderPageIndex}.html`),
        }
      : null,
    index: true,
  });
}

function chunkForPagination(posts) {
  const postsForPaginationChunks = [...posts];

  while (postsForPaginationChunks.length % PAGE_SIZE) {
    postsForPaginationChunks.unshift(null);
  }

  const pages = chunk(postsForPaginationChunks, PAGE_SIZE);
  if (pages.length) {
    pages[0] = pages[0].filter(Boolean);
  }

  return pages;
}

function reverseAlphabetical(a, b) {
  return a > b ? -1 : 1;
}

async function generateArchivePage(db, blog) {
  const posts = await db.all(`
    SELECT id, strftime('%Y', created) year, strftime('%Y-%m', created) month
    FROM posts
    WHERE draft = 0 AND internal = 0 AND private = 0
    ORDER BY datetime(created) DESC, id DESC
  `);

  const pages = chunkForPagination(posts);

  const postToPageMapping = pages.reduce((acc, page, i) => {
    for (const post of page) {
      acc[post.id] = pages.length - i;
    }

    return acc;
  }, {});

  const yearsMap = groupBy(posts, (post) => post.year);

  const years = Object.keys(yearsMap)
    .sort(reverseAlphabetical)
    .map((year) => {
      const yearPosts = yearsMap[year];
      const monthsMap = groupBy(yearPosts, (post) => post.month);

      return {
        year,
        months: Object.keys(monthsMap)
          .sort(reverseAlphabetical)
          .map((month) => {
            const firstPost = monthsMap[month][0];
            const pageNumber = postToPageMapping[firstPost.id];

            return {
              text: firstPost.month,
              url: `./page-${pageNumber}.html#${firstPost.id}`,
            };
          }),
      };
    });

  return await render("archive.mustache", {
    blog,
    title: "archive",
    url: "./archive.html",
    years,
  });
}

async function generateRSSPage(db, blog) {
  const posts = await getPosts(
    db,
    {},
    "draft = 0 AND internal = 0 AND private = 0",
    PAGE_SIZE
  );

  return await render("rss.mustache", {
    blog,
    pubDate: new Date().toUTCString(),
    posts: posts,
  });
}

async function getPagination(db, postsCreatedAfter) {
  let query = `
    SELECT id
    FROM posts
    WHERE draft = 0 AND internal = 0 AND private = 0
    ORDER BY datetime(created) DESC, id DESC
  `;
  let params = [];
  let paginationOffset = 0;

  if (postsCreatedAfter) {
    const totalPostCount = (
      await db.get(
        `SELECT count(*) as c FROM posts WHERE draft = 0 AND internal = 0 AND private = 0`
      )
    ).c;

    const postsAfterCurrentCount =
      (
        await db.get(
          `
          SELECT count(*) as c FROM posts
          WHERE draft = 0 AND internal = 0 AND private = 0 AND datetime(created) >= datetime(?1)
        `,
          { 1: postsCreatedAfter }
        )
      ).c || 1;

    const postsCountOnAffectedPages =
      postsAfterCurrentCount +
      ((totalPostCount - postsAfterCurrentCount) % PAGE_SIZE);

    query = query + ` LIMIT ?1 `;
    params = { 1: postsCountOnAffectedPages };
    paginationOffset = (totalPostCount - postsCountOnAffectedPages) / PAGE_SIZE;
  }

  const posts = await db.all(query, params);

  const pagination = chunkForPagination(posts).map((page, i, arr) => ({
    posts: page.map((p) => p.id),
    index: arr.length - i + paginationOffset,
  }));

  return pagination;
}

async function generateAfterEdit(db, postId, oldStatus, oldCreated, oldSlug) {
  const blog = await getBlogObject();
  const post = await getPost(db, postId);
  const newSlug = post.slug;
  const newStatus = post.status;
  const newCreated = post.created;

  if (oldSlug && newSlug !== oldSlug) {
    await unlinkFileWithGzip(path.join(DIST, `${oldSlug}.html`));
  }

  if (newStatus === "draft" || newStatus === "internal") {
    await unlinkFileWithGzip(path.join(DIST, `${post.id}.html`));
  }

  if (newStatus === "draft") {
    if (post.slug) {
      await unlinkFileWithGzip(path.join(DIST, `${post.slug}.html`));
    }
  } else if (newStatus === "internal") {
    const renderedPage = await generatePostPage(post, blog);

    await writeFileWithGzip(path.join(DIST, `${post.slug}.html`), renderedPage);
  } else {
    const renderedPage = await generatePostPage(post, blog);

    if (post.slug && post.id !== post.slug) {
      await writeFileWithGzip(
        path.join(DIST, `${post.slug}.html`),
        renderedPage
      );
    }

    await writeFileWithGzip(path.join(DIST, `${post.id}.html`), renderedPage);
  }

  const becameOrWasPublic = oldStatus === "public" || newStatus === "public";

  if (becameOrWasPublic) {
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
      path.join(DIST, "index.html"),
      await generateIndexPage(db, blog, newestPage)
    );

    if (pages.length <= 2) {
      await writeFileWithGzip(
        path.join(DIST, "rss.xml"),
        await generateRSSPage(db, blog)
      );
    }

    const postsTimelineDidChange =
      oldStatus !== newStatus || +oldCreated !== +new Date(newCreated);

    const pagesToUpdate = postsTimelineDidChange ? pages : pages.slice(-1);

    for (const page of pagesToUpdate) {
      const pageNumber = page.index;

      await writeFileWithGzip(
        path.join(DIST, `page-${pageNumber}.html`),
        await generatePaginationPage(
          db,
          blog,
          pageNumber,
          page.posts,
          newestPage
        )
      );
    }

    if (postsTimelineDidChange) {
      await writeFileWithGzip(
        path.join(DIST, "archive.html"),
        await generateArchivePage(db, blog)
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
  generateRSSPage,
};
