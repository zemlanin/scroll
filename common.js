const path = require("path");
const marked = require("marked");
const cheerio = require("cheerio");
const mustache = require("mustache");
const { promisify } = require("util");

const fs = require("fs");
const fsPromises = {
  readFile: promisify(fs.readFile)
};

const fontAwesomeSVGReducer = (acc, icon) =>
  icon.icon ? { ...acc, [icon.iconName]: icon.icon[4] } : acc;

const fas = Object.values(
  require("@fortawesome/fontawesome-free-solid")
).reduce(fontAwesomeSVGReducer, {});
const fab = Object.values(
  require("@fortawesome/fontawesome-free-brands")
).reduce(fontAwesomeSVGReducer, {});

const PAGE_SIZE = 10;
const MINIMUM_INDEX_PAGE_SIZE = 5;
const BLOG_TITLE = "zemlan.in";
const BLOG_BASE_URL = process.env.BLOG_BASE_URL || ".";

const IMPORT_ICONS = {
  wordpress: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="${
    fab["wordpress-simple"]
  }"></path></svg>`,
  tumblr: {
    zem: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path fill="#36465d" d="${
      fab["tumblr-square"]
    }"></path></svg>`,
    doremarkable: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path fill="#ff6961" d="${
      fab["tumblr-square"]
    }"></path></svg>`
  },
  twitter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="#1da1f2" d="${
    fab.twitter
  }"></path></svg>`,
  instagram: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path fill="currentColor" d="${
    fab.instagram
  }"></path></svg>`
};

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

  const appleMusicPath = href.match(/https:\/\/itunes\.apple\.com\/(.+)/);
  if (appleMusicPath) {
    href = `https://embed.music.apple.com/${appleMusicPath[1]}`;
  }

  if (href.indexOf("//www.youtube.com/embed/") > -1) {
    const youtubeId = href.match(/\/embed\/([^?]+)/)[1];

    const imgSrc = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
    const dataSrc =
      href +
      (href.indexOf("?") === -1
        ? "?rel=0&modestbranding=1&playsinline=1"
        : "&rel=0&modestbranding=1&playsinline=1");
    const ytHref = `https://www.youtube.com/watch?v=${youtubeId}`;

    return `<a class="future-frame" href="${ytHref}" data-src="${dataSrc}">
      <img src="${imgSrc}">
    </a>`;
  }

  if (href.indexOf("//player.vimeo.com/video/") > -1) {
    return `<iframe src="${href}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;
  }

  if (href.indexOf("//www.funnyordie.com/embed/") > -1) {
    return `<iframe src="${href}" width="640" height="360" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
  }

  if (href.indexOf("//embed.music.apple.com/") > -1) {
    const height =
      href.indexOf("/album/") > -1 && href.match(/[?&]i=\d+/)
        ? 150 // track
        : 360; // album/playlist
    return `<iframe width="640" height="${height}" allow="autoplay *; encrypted-media *;" frameborder="0" sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation" src="${href}"></iframe>`;
  }

  if (href.startsWith("/media/")) {
    href = process.env.BLOG_BASE_URL
      ? process.env.BLOG_BASE_URL + href
      : href.slice(1);
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
        .replace(
          /((src|href|poster)=['"]?)\/media\//g,
          `$1${
            process.env.BLOG_BASE_URL ? process.env.BLOG_BASE_URL + "/" : ""
          }media/`
        );

    return `<video playsinline controls preload="none" src="${href}" ${attrs ||
      ""}></video>`;
  }

  return ogImage(href, title, text);
};

renderer.link = function(href, title, text) {
  if (href.startsWith("/media/")) {
    href = process.env.BLOG_BASE_URL
      ? process.env.BLOG_BASE_URL + href
      : href.slice(1);
  }

  return ogLink(href, title, text);
};

renderer.html = function(html) {
  html = html.replace(
    /((src|href|poster)=['"]?)\/media\//g,
    `$1${
      process.env.BLOG_BASE_URL ? process.env.BLOG_BASE_URL + "/" : ""
    }media/`
  );

  return ogHTML(html);
};

renderer.paragraph = function(text) {
  text = text.replace(
    /((src|href|poster)=['"]?)\/media\//g,
    `$1${
      process.env.BLOG_BASE_URL ? process.env.BLOG_BASE_URL + "/" : ""
    }media/`
  );

  return ogParagraph(text);
};

marked.setOptions({
  gfm: true,
  smartypants: false,
  renderer: renderer,
  baseUrl: process.env.BLOG_BASE_URL || null
});

function getPostUrl(post) {
  return `${BLOG_BASE_URL}/${post.slug || post.id}.html`;
}

function prepare(post) {
  const tokens = marked.lexer(post.text);

  const header1Token = tokens.find(t => t.type === "heading" && t.text);

  const created = new Date(parseInt(post.created));

  let title = post.slug || created.toISOString().split("T")[0];
  const url = getPostUrl(post);

  if (header1Token) {
    title = cheerio.load(marked(header1Token.text)).text();
    post.text = post.text.replace(
      header1Token.text,
      `[${header1Token.text}](${url})`
    );
  }

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

  let status;
  if (post.draft) {
    status = "draft";
  } else if (post.private) {
    status = "private";
  } else if (post.public) {
    status = "public";
  }

  return {
    id: post.id,
    slug: post.slug,
    draft: post.draft,
    private: post.private,
    public: post.public,
    status: status,
    url,
    title,
    text: post.text,
    created: created.toISOString().replace(/\.\d{3}Z$/, "Z"),
    createdDate: created.toISOString().split("T")[0],
    createdUTC: created.toUTCString(),
    modified: post.modified
      ? new Date(parseInt(post.modified)).toISOString()
      : null,
    imported
  };
}

async function loadTemplate(tmpl) {
  return (
    loadTemplate.cache[tmpl] ||
    (loadTemplate.cache[tmpl] = (await fsPromises.readFile(tmpl)).toString())
  );
}
loadTemplate.cache = {};

async function render(tmpl, data) {
  return mustache.render(
    await loadTemplate(path.resolve(__dirname, tmpl)),
    {
      fas,
      fab,
      ...data
    },
    {
      header: await loadTemplate(
        path.resolve(__dirname, "templates", "header.mustache")
      ),
      footer: await loadTemplate(
        path.resolve(__dirname, "templates", "footer.mustache")
      )
    }
  );
}

module.exports = {
  BLOG_TITLE,
  BLOG_BASE_URL,
  PAGE_SIZE,
  MINIMUM_INDEX_PAGE_SIZE,
  IMPORT_ICONS,
  prepare,
  render,
  renderer
};
