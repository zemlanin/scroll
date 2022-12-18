const url = require("url");
const path = require("path");

const chunk = require("lodash.chunk");
const groupBy = require("lodash.groupby");

const {
  DIST,
  PAGE_SIZE,
  MINIMUM_INDEX_PAGE_SIZE,
  RSS_SIZE,
  prepare,
  getBlogObject,
  writeFileWithGzip,
  unlinkFileWithGzip,
} = require("./common.js");
const { render } = require("./render.js");
const EmbedsLoader = require("./embeds-loader.js");
const { generateLinkblogSection } = require("./linkblog");

function getPostsQuery(where, limit) {
  let query = `
    SELECT
      id,
      slug,
      draft,
      internal,
      private,
      (NOT draft AND NOT internal AND NOT private) public,
      lang,
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

  const posts = [];

  for (const row of await db.all(getPostsQuery(where, limit), params)) {
    posts.push(await prepare(row, embedsLoader));
  }

  return posts;
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
    lang: post.lang,
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

  const pageASPath = path.join(
    DIST,
    `actor/blog/outbox/page-${newestPage.index + 1}.json`
  );
  await unlinkFileWithGzip(pageASPath);
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

  const indexPageAsNewer =
    newestPage.index === pageNumber ||
    newestPage.index === pageNumber + 1 ||
    (newestPage.index === pageNumber + 2 &&
      newestPage.posts.length < MINIMUM_INDEX_PAGE_SIZE);

  return await render("list.mustache", {
    blog,
    number: pageNumber,
    pagination: {
      url: url.resolve(blog.url, pageUrl),
      lang: blog.lang, // HACK: provide `lang` for `{{#t}}` block inside `{{#pagination}}`
    },
    url: pageUrl,
    posts: posts,
    newer: indexPageAsNewer
      ? {
          lang: blog.lang,
          isIndex: true,
          url: blog.url,
        }
      : {
          lang: blog.lang,
          number: pageNumber + 1,
          url: url.resolve(blog.url, `page-${pageNumber + 1}.html`),
        },
    older:
      pageNumber > 1
        ? {
            lang: blog.lang,
            number: pageNumber - 1,
            url: url.resolve(blog.url, `page-${pageNumber - 1}.html`),
          }
        : null,
  });
}

async function generateActivityStreamPage(
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

  const pageId = new URL(`actor/blog/outbox/page-${pageNumber}`, blog.url);

  return JSON.stringify({
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "OrderedCollectionPage",
    totalItems: posts.length,
    id: pageId,
    next:
      pageNumber > 1
        ? new URL(`actor/blog/outbox/page-${pageNumber - 1}`, blog.url)
        : null,
    prev:
      pageNumber < newestPage.index
        ? new URL(`actor/blog/outbox/page-${pageNumber + 1}`, blog.url)
        : null,
    partOf: new URL(`actor/blog/outbox`, blog.url),
    summary: `${blog.title} / page ${pageNumber}`,
    orderedItems: posts.map((post) => {
      const activityASid = new URL(
        `actor/blog/notes/${post.id}#activity`,
        blog.url
      );

      return {
        id: activityASid,
        type: "Create",
        actor: new URL(`actor/blog`, blog.url),
        published: post.created,
        to: ["https://www.w3.org/ns/activitystreams#Public"],
        cc: [
          // "https://mastodon.devua.club/users/zemlanin/followers"
        ],
        object: generateActivityStreamNote(post, blog),
      };
    }),
  });
}

function generateActivityStreamNote(post, blog) {
  const postASid = new URL(`actor/blog/notes/${post.id}`, blog.url);
  const content =
    `<p>${post.title}</p>` +
    (post.opengraph.description ? `<p>${post.opengraph.description}</p>` : "") +
    `<p><a href="${
      post.url
    }" target="_blank" rel="nofollow noopener noreferrer"><span class="invisible">${post.url.replace(
      /^(https?:\/\/).+$/,
      "$1"
    )}</span><span>${post.url.replace(/^https?:\/\//, "")}</span></a></p>`;

  return {
    id: postASid,
    type: "Note",
    published: post.created,
    attributedTo: new URL(`actor/blog`, blog.url),
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: [
      // "https://mastodon.devua.club/users/zemlanin/followers"
    ],
    url: new URL(post.slug ? `${post.slug}.html` : `${post.id}.html`, blog.url),
    content: content,
    contentMap: {
      [post.lang || blog.lang]: content,
    },
    updated: post.modified || post.created,
    attachement: post.opengraph.image
      ? [
          {
            type: "Image",
            url: post.opengraph.image,
            // "name": "iOS Home Screen with a fake calendar widget showing 1000th of March 2020",
            width: post.opengraph.imageWidth,
            height: post.opengraph.imageHeight,
          },
        ]
      : [],
  };
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

  const links = await generateLinkblogSection(db, blog);

  if (links.length && posts[0]) {
    posts[0].insertLinkblogAfterThis = true;
  }

  return await render("list.mustache", {
    blog,
    posts,
    links,
    newer: null,
    older: olderPageIndex
      ? {
          lang: blog.lang,
          number: olderPageIndex,
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
    archive: true,
    url: "./archive.html",
    years,
  });
}

async function generateRSSPage(db, blog) {
  const posts = await getPosts(
    db,
    {},
    "draft = 0 AND internal = 0 AND private = 0",
    RSS_SIZE
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
    await unlinkFileWithGzip(
      path.join(DIST, `actor/blog/notes/${oldSlug}.json`)
    );
  }

  if (newStatus === "draft" || newStatus === "internal") {
    await unlinkFileWithGzip(path.join(DIST, `${post.id}.html`));
    await unlinkFileWithGzip(
      path.join(DIST, `actor/blog/notes/${post.id}.json`)
    );
  }

  if (newStatus === "draft") {
    if (post.slug) {
      await unlinkFileWithGzip(path.join(DIST, `${post.slug}.html`));
      await unlinkFileWithGzip(
        path.join(DIST, `actor/blog/notes/${post.slug}.json`)
      );
    }
  } else if (newStatus === "internal") {
    const renderedPage = await generatePostPage(post, blog);

    await writeFileWithGzip(path.join(DIST, `${post.slug}.html`), renderedPage);
  } else {
    const renderedPage = await generatePostPage(post, blog);
    const asNote = {
      "@context": "https://www.w3.org/ns/activitystreams",
      ...generateActivityStreamNote(post, blog),
    };

    if (post.slug && post.id !== post.slug) {
      await writeFileWithGzip(
        path.join(DIST, `${post.slug}.html`),
        renderedPage
      );

      await writeFileWithGzip(
        path.join(DIST, `actor/blog/notes/${post.slug}.json`),
        JSON.stringify(asNote)
      );
    }

    await writeFileWithGzip(path.join(DIST, `${post.id}.html`), renderedPage);

    await writeFileWithGzip(
      path.join(DIST, `actor/blog/notes/${post.id}.json`),
      JSON.stringify(asNote)
    );
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

    await writeFileWithGzip(
      path.join(DIST, "actor/blog/outbox.json"),
      JSON.stringify({
        "@context": "https://www.w3.org/ns/activitystreams",
        id: new URL("actor/blog/outbox", blog.url),
        type: "OrderedCollection",
        totalItems:
          newestPage.posts.length +
          Math.max(newestPage.index - 1, 0) * PAGE_SIZE,
        first: new URL(
          `actor/blog/outbox/page-${newestPage.index}`,
          blog.url
        ).toString(),
        last: new URL(`actor/blog/outbox/page-1`, blog.url).toString(),
      })
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

      await writeFileWithGzip(
        path.join(DIST, `actor/blog/outbox/page-${pageNumber}.json`),
        await generateActivityStreamPage(
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
  generateActivityStreamPage,
  generateActivityStreamNote,
  generateArchivePage,
  generateIndexPage,
  generateRSSPage,
};
