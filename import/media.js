const _fs = require("fs");
const path = require("path");
const sqlite = require("sqlite");
const request = require("request-promise-native");
const { promisify } = require("util");

const fs = {
  mkdir: promisify(_fs.mkdir),
  access: promisify(_fs.access),
  readdir: promisify(_fs.readdir),
  readFile: promisify(_fs.readFile),
  writeFile: promisify(_fs.writeFile),
  copyFile: promisify(_fs.copyFile)
};

const _id = require("nanoid/generate");
const getMediaId = () =>
  _id("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 26);

async function loadMedia(src, db) {
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
    "INSERT INTO media (id, ext, data, created) VALUES (?1, ?2, ?3, ?4)",
    {
      1: result.id,
      2: result.ext,
      3: resp,
      4: new Date().toISOString()
    }
  );

  await fs.copyFile(
    filePath,
    path.resolve(
      __dirname,
      process.env.DIST || "../dist",
      "media",
      `${result.id}.${result.ext}`
    )
  );

  return result;
}

if (require.main === module) {
  process.stdin.setEncoding("utf8");

  let stdin = "";

  process.stdin.on("readable", () => {
    const chunk = process.stdin.read();
    if (chunk !== null) {
      stdin += chunk;
    }
  });

  process.stdin.on("end", () => {
    if (!stdin || !stdin.trim()) {
      return;
    }

    sqlite
      .open("./posts.db")
      .then(db => Promise.all(stdin.split("\n").map(src => loadMedia(src, db))))
      .then(loaded => {
        loaded.map(l => console.log(l.src, "/media/" + l.id + "." + l.ext));

        process.exit(0);
      })
      .catch(err => {
        console.error(err);
        process.exit(1);
      });
  });
} else {
  module.exports = {
    loadMedia,
    openFileMedia
  };
}
