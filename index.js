const _fs = require("fs");
const { promisify } = require("util");

const fs = {
  mkdir: promisify(_fs.mkdir),
  access: promisify(_fs.access),
  readFile: promisify(_fs.readFile),
  writeFile: promisify(_fs.writeFile),
  exists: promisify(_fs.exists)
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
    const youtubeId = href.match(/\/embed\/([^?]+)/)[1]

    const imgSrc = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
    const dataSrc = href + (href.indexOf('?') === -1 ? '?rel=0&modestbranding=1&playsinline=1' : '&rel0&modestbranding=1&playsinline=1')
    const ytHref = `https://www.youtube.com/watch?v=${youtubeId}`

    return `<a class="future-frame" href="${ytHref}" data-src="${dataSrc}">
      <img src="${imgSrc}">
    </a>`
  }

  if (href.indexOf("//player.vimeo.com/video/") > -1) {
    return `<iframe src="${href}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;
  }

  if (href.indexOf("//www.funnyordie.com/embed/") > -1) {
    return `<iframe src="${href}" width="640" height="360" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
  }

  if (href.startsWith("/media/")) {
    href = process.env.BLOG_BASE_URL ? process.env.BLOG_BASE_URL + href : href.slice(1);
  }

  if (
    (href.startsWith("media/") && href.endsWith(".mp4")) ||
    (text && text.indexOf("poster=") > -1)
  ) {
    const attrs =
      text &&
      text
        .replace(/&apos;/g, `'`)
        .replace(/&quot;/g, `"`)
        .replace(/((src|href|poster)=['"]?)\/media\//g, `$1${process.env.BLOG_BASE_URL ? process.env.BLOG_BASE_URL + '/' : ''}media/`);

    return `<video playsinline controls preload="none" src="${href}" ${attrs ||
      ""}></video>`;
  }

  return ogImage(href, title, text);
};

renderer.link = function(href, title, text) {
  if (href.startsWith("/media/")) {
    href = process.env.BLOG_BASE_URL ? process.env.BLOG_BASE_URL + href : href.slice(1);
  }

  return ogLink(href, title, text);
};

renderer.html = function(html) {
  html = html.replace(/((src|href|poster)=['"]?)\/media\//g, `$1${process.env.BLOG_BASE_URL ? process.env.BLOG_BASE_URL + '/' : ''}media/`);

  return ogHTML(html);
};

renderer.paragraph = function(text) {
  text = text.replace(/((src|href|poster)=['"]?)\/media\//g, `$1${process.env.BLOG_BASE_URL ? process.env.BLOG_BASE_URL + '/' : ''}media/`);

  return ogParagraph(text);
};

marked.setOptions({
  gfm: true,
  smartypants: false,
  renderer: renderer,
  baseUrl: process.env.BLOG_BASE_URL || null
});

const IMPORT_ICONS = {
  wordpress: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M61.7 169.4l101.5 278C92.2 413 43.3 340.2 43.3 256c0-30.9 6.6-60.1 18.4-86.6zm337.9 75.9c0-26.3-9.4-44.5-17.5-58.7-10.8-17.5-20.9-32.4-20.9-49.9 0-19.6 14.8-37.8 35.7-37.8.9 0 1.8.1 2.8.2-37.9-34.7-88.3-55.9-143.7-55.9-74.3 0-139.7 38.1-177.8 95.9 5 .2 9.7.3 13.7.3 22.2 0 56.7-2.7 56.7-2.7 11.5-.7 12.8 16.2 1.4 17.5 0 0-11.5 1.3-24.3 2l77.5 230.4L249.8 247l-33.1-90.8c-11.5-.7-22.3-2-22.3-2-11.5-.7-10.1-18.2 1.3-17.5 0 0 35.1 2.7 56 2.7 22.2 0 56.7-2.7 56.7-2.7 11.5-.7 12.8 16.2 1.4 17.5 0 0-11.5 1.3-24.3 2l76.9 228.7 21.2-70.9c9-29.4 16-50.5 16-68.7zm-139.9 29.3l-63.8 185.5c19.1 5.6 39.2 8.7 60.1 8.7 24.8 0 48.5-4.3 70.6-12.1-.6-.9-1.1-1.9-1.5-2.9l-65.4-179.2zm183-120.7c.9 6.8 1.4 14 1.4 21.9 0 21.6-4 45.8-16.2 76.2l-65 187.9C426.2 403 468.7 334.5 468.7 256c0-37-9.4-71.8-26-102.1zM504 256c0 136.8-111.3 248-248 248C119.2 504 8 392.7 8 256 8 119.2 119.2 8 256 8c136.7 0 248 111.2 248 248zm-11.4 0c0-130.5-106.2-236.6-236.6-236.6C125.5 19.4 19.4 125.5 19.4 256S125.6 492.6 256 492.6c130.5 0 236.6-106.1 236.6-236.6z"></path></svg>`,
  tumblr: {
    zem: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path fill="#36465d" d="M400 32H48C21.5 32 0 53.5 0 80v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48zm-82.3 364.2c-8.5 9.1-31.2 19.8-60.9 19.8-75.5 0-91.9-55.5-91.9-87.9v-90h-29.7c-3.4 0-6.2-2.8-6.2-6.2v-42.5c0-4.5 2.8-8.5 7.1-10 38.8-13.7 50.9-47.5 52.7-73.2.5-6.9 4.1-10.2 10-10.2h44.3c3.4 0 6.2 2.8 6.2 6.2v72h51.9c3.4 0 6.2 2.8 6.2 6.2v51.1c0 3.4-2.8 6.2-6.2 6.2h-52.1V321c0 21.4 14.8 33.5 42.5 22.4 3-1.2 5.6-2 8-1.4 2.2.5 3.6 2.1 4.6 4.9l13.8 40.2c1 3.2 2 6.7-.3 9.1z"></path></svg>`,
    doremarkable: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path fill="#ff6961" d="M400 32H48C21.5 32 0 53.5 0 80v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48zm-82.3 364.2c-8.5 9.1-31.2 19.8-60.9 19.8-75.5 0-91.9-55.5-91.9-87.9v-90h-29.7c-3.4 0-6.2-2.8-6.2-6.2v-42.5c0-4.5 2.8-8.5 7.1-10 38.8-13.7 50.9-47.5 52.7-73.2.5-6.9 4.1-10.2 10-10.2h44.3c3.4 0 6.2 2.8 6.2 6.2v72h51.9c3.4 0 6.2 2.8 6.2 6.2v51.1c0 3.4-2.8 6.2-6.2 6.2h-52.1V321c0 21.4 14.8 33.5 42.5 22.4 3-1.2 5.6-2 8-1.4 2.2.5 3.6 2.1 4.6 4.9l13.8 40.2c1 3.2 2 6.7-.3 9.1z"></path></svg>`
  },
  twitter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="#1da1f2" d="M459.37 151.716c.325 4.548.325 9.097.325 13.645 0 138.72-105.583 298.558-298.558 298.558-59.452 0-114.68-17.219-161.137-47.106 8.447.974 16.568 1.299 25.34 1.299 49.055 0 94.213-16.568 130.274-44.832-46.132-.975-84.792-31.188-98.112-72.772 6.498.974 12.995 1.624 19.818 1.624 9.421 0 18.843-1.3 27.614-3.573-48.081-9.747-84.143-51.98-84.143-102.985v-1.299c13.969 7.797 30.214 12.67 47.431 13.319-28.264-18.843-46.781-51.005-46.781-87.391 0-19.492 5.197-37.36 14.294-52.954 51.655 63.675 129.3 105.258 216.365 109.807-1.624-7.797-2.599-15.918-2.599-24.04 0-57.828 46.782-104.934 104.934-104.934 30.213 0 57.502 12.67 76.67 33.137 23.715-4.548 46.456-13.32 66.599-25.34-7.798 24.366-24.366 44.833-46.132 57.827 21.117-2.273 41.584-8.122 60.426-16.243-14.292 20.791-32.161 39.308-52.628 54.253z"></path></svg>`,
  instagram: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path fill="currentColor" d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"></path></svg>`
};

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
  return post.slug
    ? `${post.id}-${post.slug}.html`
    : `${post.id}.html`;
}

function getPostUrl(post) {
  return `${BLOG_BASE_URL}/${getPostFilename(post)}`
}

async function generate() {
  if (await fs.exists("dist") && await fs.access("dist", _fs.constants.W_OK)) {
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

    const newerPost = i ? posts[i - 1] : null;
    const olderPost = posts[i + 1];

    return {
      id: post.id,
      filename: getPostFilename(post),
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

  console.log('post preparation done')

  const postsCount = preparedPosts.length
  const progressPadding = Math.log10(postsCount) + 1
  let i = 0

  process.stdout.write('');

  for (const postsChunk of chunk(preparedPosts, 16)) {
    i = i + postsChunk.length
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(`${postsChunk[0].created.slice(0, 4)} ${i.toString().padStart(progressPadding)}/${postsCount} ${'#'.repeat(parseInt(i*50/postsCount))}${'.'.repeat(parseInt((postsCount-i)*50/postsCount))}`);

    await Promise.all(
      postsChunk.map(async post => {
        post.html = marked(
          post.text.replace(/¯\\_\(ツ\)_\/¯/g, "¯\\\\\\_(ツ)\\_/¯")
        )

         return fs.writeFile(
          `./dist/${post.filename}`,
          await render("./templates/post.mustache", {
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
          })
        )
      })
    );
  }

  process.stdout.write("\n");
  console.log('posts done')

  const PAGE_SIZE = 20;

  if (preparedPosts.length % PAGE_SIZE) {
    for (let i = 0; i < preparedPosts.length % PAGE_SIZE; i++) {
      preparedPosts.unshift(null);
    }
  }

  const pagination = chunk(preparedPosts, PAGE_SIZE);

  pagination[0] = pagination[0].filter(Boolean);

  let pageNumber = pagination.length;
  for (const page of pagination) {
    const url = `page-${pageNumber}.html`;
    const title = `page-${pageNumber}`;

    await fs.writeFile(
      `./dist/${url}`,
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

  console.log('pagination done')

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
    `./dist/index.html`,
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

  const feedPosts = indexPage.slice(0, PAGE_SIZE)

  await fs.writeFile(
    `./dist/rss.xml`,
    await render("./templates/rss.mustache", {
      blog: {
        title: BLOG_TITLE,
        url: BLOG_BASE_URL + "/index.html"
      },
      feed: {
        pubDate: new Date(Math.max.apply(null, feedPosts.map(p => new Date(p.created)))).toUTCString(),
        description: `Everything feed - ${BLOG_TITLE}`,
        url: BLOG_BASE_URL + "/rss.xml"
      },
      posts: feedPosts,
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
    `./dist/archive.html`,
    await render("./templates/archive.mustache", {
      blog: {
        title: BLOG_TITLE,
        url: BLOG_BASE_URL + "/index.html"
      },
      title: "archive",
      url: "./archive.html",
      months: monthGroups.map(month => ({
        month,
        pages: groupByMonth[month]
      }))
    })
  );

  console.log('archive done')

  const media = await db.all("SELECT * from media");

  await fs.mkdir("dist/media");

  for (const mediaChunk of chunk(media, 16)) {
    await Promise.all(
      mediaChunk.map(async m =>
        fs.writeFile(`./dist/media/${m.id}.${m.ext}`, m.data)
      )
    );
  }

  console.log('media done')
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
