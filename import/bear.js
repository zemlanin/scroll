const _fs = require("fs");
const _id = require("nanoid/generate");
const path = require("path");
const marked = require("marked");
const sqlite = require("sqlite");
const querystring = require("querystring");
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

function makeSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/_+/g, "_");
}

async function importBear(filepath) {
  const noteText = (await fs.readFile(filepath)).toString();
  const filename = filepath.match(/\/([^/]+)\.md/)[1];
  const id = makeSlug(filename);
  const media = new Set();

  const db = await sqlite.open("./posts.db");

  await db.run(`DELETE FROM posts WHERE id = ?1`, {
    1: id
  });

  const renderer = new marked.Renderer();
  const ogImage = renderer.image.bind(renderer);
  renderer.image = function(href, title, text) {
    if (href.startsWith(querystring.escape(filename) + "/")) {
      media.add({
        src: href,
        path: path.resolve(filepath, "..", querystring.unescape(href))
      });
    }

    return ogImage(href, title, text);
  };

  marked.setOptions({
    gfm: true,
    smartypants: false,
    renderer: renderer
  });

  marked(noteText);

  let text = noteText;

  for (const m of media) {
    const loaded = await openFileMedia(`file://${m.path}`, m.path, db);

    while (text.indexOf(m.src) > -1) {
      text = text.replace(m.src, `/media/${loaded.id}.${loaded.ext}`);
    }
  }

  await db.run(
    "INSERT INTO posts (id, text, import_url, import_raw) VALUES (?1, ?2, ?4, ?6)",
    {
      1: id,
      2: text,
      4: `file://${filepath}`,
      6: noteText
    }
  );
}

importBear(process.argv[2])
  .then(() => {
    console.log("done");
    process.exit(0);
  })
  .catch(err => {
    console.trace(err);
    process.exit(1);
  });
