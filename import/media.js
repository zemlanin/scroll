const _fs = require("fs");
const sqlite = require("sqlite");
const request = require("request-promise-native");
const { promisify, inspect } = require("util");

const fs = {
  mkdir: promisify(_fs.mkdir),
  access: promisify(_fs.access),
  readdir: promisify(_fs.readdir),
  readFile: promisify(_fs.readFile),
  writeFile: promisify(_fs.writeFile)
};

function escape(text) {
  return text
    .replace(/\n/g, "  \n")
    .replace(/([\\`[\]])/g, "\\$1")
    .replace(/^\s*([+\-_*])/gm, "\\$1")
    .replace(/\\_\(ツ\)_/gm, "\\\\_(ツ)\\_");
}

async function getTime(tweet) {
  if (tweet.created_at.indexOf("00:00:00") > -1) {
    const twitterUrl = `https://twitter.com/${tweet.user.screen_name}/status/${
      tweet.id_str
    }`;
    const resp = await request.get(twitterUrl);

    const timestamp = resp.match(/data-time-ms="(\d+)"/);
    if (timestamp) {
      return new Date(+timestamp[1]).toISOString();
    }
  }

  return new Date(tweet.created_at).toISOString();
}

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
    loadMedia
  };
}
