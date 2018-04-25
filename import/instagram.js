const _fs = require("fs");
const _id = require("nanoid/generate");
const path = require("path");
const sqlite = require("sqlite");
const { promisify } = require("util");

const fs = {
  mkdir: promisify(_fs.mkdir),
  access: promisify(_fs.access),
  readdir: promisify(_fs.readdir),
  readFile: promisify(_fs.readFile),
  writeFile: promisify(_fs.writeFile)
};

const getMediaId = () =>
  _id("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 26);

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

  const resp = await fs.readFile(filePath);

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

async function importInstagram() {
  const postsJson = JSON.parse(
    (await fs.readFile(
      path.resolve(__dirname, "instagram", "media.json")
    )).toString()
  );

  const db = await sqlite.open("./posts.db");

  await db.run(`DELETE FROM posts WHERE id LIKE "instagram%"`);

  const posts = [];

  for (const post of postsJson.photos) {
    const id = `instagram-${post.taken_at.replace(/:/g, "").toLowerCase()}`;
    const mediaPath = path.resolve(__dirname, "instagram", post.path);
    const loaded = await openFileMedia(`file://${mediaPath}`, mediaPath, db);

    const text = post.caption
      ? `![](/media/${loaded.id}.${loaded.ext})\n\n${post.caption}`
      : `![](/media/${loaded.id}.${loaded.ext})`;

    posts.push({
      id: id,
      text: text,
      created: new Date(post.taken_at + "Z").toISOString()
    });
  }

  for (const post of postsJson.videos) {
    const id = `instagram-${post.taken_at.replace(/:/g, "").toLowerCase()}`;
    const mediaPath = path.resolve(__dirname, "instagram", post.path);
    const loaded = await openFileMedia(`file://${mediaPath}`, mediaPath, db);

    const text = post.caption
      ? `<video src="/media/${loaded.id}.${loaded.ext}" controls></video>\n\n${
          post.caption
        }`
      : `<video src="/media/${loaded.id}.${loaded.ext}" controls></video>`;

    posts.push({
      id: id,
      text: text,
      created: new Date(post.taken_at + "Z").toISOString()
    });
  }

  for (const post of posts) {
    await db.run(
      "INSERT INTO posts (id, text, import_url, created, import_raw) VALUES (?1, ?2, ?4, ?5, ?6)",
      {
        1: post.id,
        2: post.text,
        4: `https://www.instagram/zemlanin/#${post.id}`,
        5: post.created,
        6: post.text
      }
    );
  }
}

importInstagram()
  .then(() => {
    console.log("done");
    process.exit(0);
  })
  .catch(err => {
    console.trace(err);
    process.exit(1);
  });
