const _fs = require("fs");
const request = require("request-promise-native");
const { promisify, inspect } = require("util");

const fs = {
  mkdir: promisify(_fs.mkdir),
  access: promisify(_fs.access),
  readdir: promisify(_fs.readdir),
  readFile: promisify(_fs.readFile),
  writeFile: promisify(_fs.writeFile)
};

const sqlite = require("sqlite");
const _id = require("nanoid/generate");
const getMediaId = () =>
  _id("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 26);

async function loadMedia(src, db, ext) {
  const alreadyLoaded = await db.get("SELECT * from media WHERE src = ?1", [
    src
  ]);

  if (alreadyLoaded) {
    return {
      id: alreadyLoaded.id,
      ext: alreadyLoaded.ext,
      src: alreadyLoaded.src
    };
  }

  const resp = await request.get(src, { encoding: null });

  const result = {
    id: getMediaId(),
    ext: ext || src.match(/\.([a-z0-9]+)$/)[1],
    src: src
  };

  await db.run(
    "INSERT INTO media (id, ext, data, src) VALUES (?1, ?2, ?3, ?4)",
    {
      1: result.id,
      2: result.ext,
      3: resp,
      4: result.src
    }
  );

  return result;
}

async function openFileMedia(src, filePath, db) {
  const alreadyLoaded = await db.get("SELECT * from media WHERE src = ?1", [
    src
  ]);

  if (alreadyLoaded) {
    return {
      id: alreadyLoaded.id,
      ext: alreadyLoaded.ext,
      src: alreadyLoaded.src
    };
  }

  const resp = await fs.readFile(filePath).catch(e => {
    if (filePath.startsWith("./upload/flickr/")) {
      return fs
        .readFile(filePath.replace(/_[a-z]\.jpg$/g, ".jpg"))
        .catch(() => fs.readFile(filePath.replace(/_[a-z]\.jpg$/g, "_b.jpg")))
        .catch(() => fs.readFile(filePath.replace(/\.jpg$/g, "_b.jpg")));
    }

    throw e;
  });

  console.log(src);

  const result = {
    id: getMediaId(),
    ext: src.match(/\.([a-z0-9]+)$/)[1],
    src: src
  };

  await db.run(
    "INSERT INTO media (id, ext, data, src) VALUES (?1, ?2, ?3, ?4)",
    {
      1: result.id,
      2: result.ext,
      3: resp,
      4: result.src
    }
  );

  return result;
}

function parseAndLoadMedia(src, db) {
  if (src.startsWith("http://zemlanin.info/wp-content/uploads/")) {
    const filePath = src.slice(
      "http://zemlanin.info/wp-content/uploads/".length
    );

    return openFileMedia(src, `./upload/${filePath}`, db);
  }

  if (
    src.startsWith("http://stat.livejournal.com/") ||
    src.startsWith("http://www.jkhp.it/OS-tan/") ||
    src.startsWith("http://img.artlebedev.ru/") ||
    src.startsWith("http://i.itnews.com.ua/news/") ||
    src.startsWith("http://www.speedtest.net/result/") ||
    src.startsWith("http://www.google.com/logos/") ||
    src.startsWith("http://img.lenta.ru/news/")
  ) {
    return loadMedia(src, db);
  }

  if (
    src ===
    "http://upload.wikimedia.org/wikipedia/en/d/d9/Heroes_title_card.png"
  ) {
    return loadMedia(
      "http://ftpmirror.your.org/pub/wikimedia/images/wikipedia/ms/d/d9/Heroes_title_card.png",
      db
    );
  }

  if (
    src ===
    "http://upload.wikimedia.org/wikipedia/en/9/91/My_Name_Is_Earl_title_screen.jpg"
  ) {
    return loadMedia(
      "http://dizipub.com/wp-content/uploads/2016/05/My_Name_Is_Earl_title_screen.jpg",
      db
    );
  }

  if (src === "http://gizmoproject.com/newsletter/images/gizmo-logo-news.gif") {
    return loadMedia(
      "https://images.readwrite.com/wp-content/uploads/2016/02/MTIyMzE0NDU2NzI1MjIwNjMz.gif",
      db
    );
  }

  if (
    src ===
    "http://zemlanin.info/wp-content/themes/earth-theme-10/images/icons/rss_ico.gif"
  ) {
    return loadMedia("http://img.findmysoft.com/ico/134385.gif", db);
  }

  if (
    src ===
    "http://upload.wikimedia.org/wikipedia/en/5/5d/Bunnies_never_close_doors.jpg"
  ) {
    return loadMedia(
      "http://2.bp.blogspot.com/_gXgQHYcqOhI/SXPHy1khkYI/AAAAAAAAB1w/4wMPs5O5eBI/s400/bunnies_never_close_doors.jpg",
      db
    );
  }

  if (
    src ===
    "http://upload.wikimedia.org/wikipedia/en/f/fd/Dead_Like_Me_-_intertitle.jpg"
  ) {
    return loadMedia(
      "https://upload.wikimedia.org/wikipedia/hr/c/cb/250px-Dead_Like_Me_-_intertitle.jpg",
      db
    );
  }

  if (src === "http://upload.wikimedia.org/wikipedia/ru/0/05/Spore_logo.png") {
    return loadMedia(
      "http://static.wixstatic.com/media/cc0558_b7987e8a3ff24b44929c40910eb15d70.png/v1/fill/w_300,h_225,al_c/cc0558_b7987e8a3ff24b44929c40910eb15d70.png",
      db
    );
  }

  if (
    src.startsWith("http://img.fotki.yandex.ru/") ||
    src.startsWith("https://img-fotki.yandex.ru/")
  ) {
    return loadMedia(src, db, "jpg");
  }

  if (src.startsWith("http://zemlanin.info/upload/")) {
    const filePath = src.slice("http://zemlanin.info/upload/".length);

    return openFileMedia(src, `./upload/${filePath}`, db);
  }

  const flickrMatch = src.match(
    /http:\/\/farm[1234].static.flickr.com\/\d+\/([0-9a-z_]+\.jpg)/
  );
  if (flickrMatch) {
    return openFileMedia(src, `./upload/flickr/${flickrMatch[1]}`, db);
  }

  throw new Error(`unknown url: ${src}`);
}

async function importTumblrPosts() {
  const db = await sqlite.open("./posts.db");

  // await db.run(`DELETE FROM posts WHERE id LIKE "wordpress%"`);

  const file = "./wordpress-blog.json";

  const content = JSON.parse((await fs.readFile(file)).toString());

  const posts = content.posts;

  for (let post of posts) {
    const postId = post.url.match(/\/([^/]+)\/$/)[1];
    const id = `wordpress-${postId}`;
    const url = post.url;

    if (await db.get("SELECT * FROM posts WHERE import_url = ?1", [url])) {
      continue;
    }

    const created = post.date;

    let raw = post.content;
    let text = post.content;

    if (post.title && post.title.trim()) {
      const title = post.title.replace(/>/g, "&gt;").trim();

      raw = `<h1>${title}</h1>\n${text}`;
      text = `# ${title}\n${text}`;
    }

    for (const m of post.media) {
      try {
        const loaded = await parseAndLoadMedia(m.url, db);
        const srcUrl = `/media/${loaded.id}.${loaded.ext}`;

        while (text.indexOf(m.url) > -1) {
          text = text.replace(m.url, srcUrl);
        }
      } catch (e) {
        // console.log(post);
        console.error(e);
        process.exit(1);
      }
    }

    for (const media_link of content.media_links) {
      if (text.indexOf(media_link) > -1) {
        try {
          const loaded = await parseAndLoadMedia(media_link, db);
          const srcUrl = `/media/${loaded.id}.${loaded.ext}`;

          while (text.indexOf(media_link) > -1) {
            text = text.replace(media_link, srcUrl);
          }
        } catch (e) {
          console.error(e);
          process.exit(1);
        }
      }
    }

    console.log(
      inspect(
        {
          text: text,
          created: created,
          id: id,
          url: url
        },
        { showHidden: false, depth: null }
      )
    );

    await db.run(
      "INSERT INTO posts (id, text, import_url, created, import_raw) VALUES (?1, ?2, ?4, ?5, ?6)",
      {
        1: id,
        2: text,
        4: url,
        5: created,
        6: raw
      }
    );
  }
}

importTumblrPosts()
  .then(() => {
    console.log("done");
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
