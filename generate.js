const fs = require("fs");
const { promisify } = require("util");
const os = require("os");
const path = require("path");

const fsPromises = {
  mkdir: promisify(fs.mkdir),
  writeFile: promisify(fs.writeFile),
  exists: promisify(fs.exists),
  mkdtemp: promisify(fs.mkdtemp),
  readdir: promisify(fs.readdir),
  lstat: promisify(fs.lstat),
  copyFile: promisify(fs.copyFile),
  readFile: promisify(fs.readFile),
};

const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");
const chunk = require("lodash.chunk");
const Rsync = require("rsync");
const mime = require("mime");

require("dotenv").config();

const {
  getPosts,
  generatePostPage,
  getPagination,
  generatePaginationPage,
  generateRSSPage,
  generateIndexPage,
  generateArchivePage,
} = require("./generate-post.js");

const {
  generateLinkblogPage,
  generateLinkblogRSSPage,
} = require("./linkblog.js");

const {
  DIST,
  POSTS_DB,
  loadIcu,
  writeFileWithGzip,
  getBlogObject,
} = require("./common.js");

function rmrf(filepath) {
  if (fs.existsSync(filepath)) {
    fs.readdirSync(filepath).forEach(function (file) {
      var curPath = filepath + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) {
        rmrf(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(filepath);
  }
}

function uniq(arr) {
  return [...new Set(arr)];
}

const mkdirP = (p) => fsPromises.mkdir(p, { recursive: true });

async function copyStaticContent(
  destination,
  stdout,
  staticPath = path.resolve(__dirname, "static")
) {
  for (const filename of await fsPromises.readdir(staticPath)) {
    if (filename && filename[0] == "." && filename !== ".well-known") {
      continue;
    }

    const filepath = path.resolve(staticPath, filename);

    if ((await fsPromises.lstat(filepath)).isDirectory()) {
      const staticSubdirectory = filepath;
      const destinationSubdirectory = path.resolve(destination, filename);

      await fsPromises.mkdir(destinationSubdirectory, { recursive: true });

      await copyStaticContent(
        destinationSubdirectory,
        stdout,
        staticSubdirectory
      );

      continue;
    }

    const mimeType = mime.getType(filename);
    stdout.write(
      `${path.relative(
        path.resolve(__dirname, "static"),
        filepath
      )} ${mimeType}\n`
    );

    if (
      (mimeType && mimeType.startsWith("text/")) ||
      mimeType === "application/javascript" ||
      mimeType === "application/json" ||
      mimeType === "image/svg+xml"
    ) {
      await writeFileWithGzip(
        path.resolve(destination, filename),
        await fsPromises.readFile(filepath),
        { flag: "wx" }
      );
    } else {
      await fsPromises.copyFile(filepath, path.resolve(destination, filename));
    }
  }
}

async function generate(db, destination, stdout, stderr, { only } = {}) {
  const tmpFolder = await fsPromises.mkdtemp(path.join(os.tmpdir(), "scroll-"));
  await fsPromises.mkdir(path.join(tmpFolder, "/media"));
  await fsPromises.mkdir(path.join(tmpFolder, "/feeds"));

  stdout.write(`made tmp dir: ${tmpFolder}\n`);

  await copyStaticContent(tmpFolder, stdout);

  const blog = await getBlogObject();

  if (!only || only.has("posts")) {
    const preparedPosts = await getPosts(db, {}, `draft = 0`, null);

    stdout.write(`loaded posts from db\n`);

    const postsCount = preparedPosts.length;

    const progressPadding = Math.log10(postsCount) + 1;
    let i = 0;

    if (stdout.clearLine && stdout.cursorTo) {
      stdout.write("");
    } else {
      stdout.write(`${postsCount} => `);
    }

    for (const postsChunk of chunk(preparedPosts, 16)) {
      i = i + postsChunk.length;

      if (stdout.clearLine && stdout.cursorTo) {
        stdout.clearLine();
        stdout.cursorTo(0);
        stdout.write(
          `${postsChunk[0].created.slice(0, 4)} ${i
            .toString()
            .padStart(progressPadding)}/${postsCount} ${"#".repeat(
            parseInt((i * 50) / postsCount)
          )}${".".repeat(parseInt(((postsCount - i) * 50) / postsCount))}`
        );
      } else {
        stdout.write(postsChunk[0].created.slice(3, 4));
      }

      await Promise.all(
        postsChunk.map(async (post) => {
          const renderedPage = await generatePostPage(post, blog);

          if (post.internal || (post.slug && post.id !== post.slug)) {
            await writeFileWithGzip(
              path.join(tmpFolder, `${post.slug}.html`),
              renderedPage,
              { flag: "wx" }
            );
          }

          if (!post.internal) {
            await writeFileWithGzip(
              path.join(tmpFolder, `${post.id}.html`),
              renderedPage,
              { flag: "wx" }
            );
          }
        })
      );
    }

    stdout.write("\n");
    stdout.write("posts done\n");
  }

  let _pagination = [];
  let _newestPage;

  if (!only || only.has("pagination") || only.has("linkblog")) {
    _pagination = await getPagination(db, null);
    _newestPage = _pagination[0] || { index: 0, posts: [] };

    await writeFileWithGzip(
      path.join(tmpFolder, "index.html"),
      await generateIndexPage(db, blog, _newestPage),
      { flag: "wx" }
    );

    stdout.write("index done\n");
  }

  const pagination = _pagination;
  const newestPage = _newestPage;

  if (!only || only.has("pagination")) {
    for (const page of pagination) {
      const pageNumber = page.index;

      await writeFileWithGzip(
        path.join(tmpFolder, `page-${pageNumber}.html`),
        await generatePaginationPage(
          db,
          blog,
          pageNumber,
          page.posts,
          newestPage
        ),
        { flag: "wx" }
      );
    }

    stdout.write("pagination done\n");
  }

  if (!only || only.has("linkblog")) {
    await writeFileWithGzip(
      path.join(tmpFolder, "linkblog.html"),
      await generateLinkblogPage(db, blog),
      { flag: "wx" }
    );

    await writeFileWithGzip(
      path.join(tmpFolder, "feeds/linkblog.xml"),
      await generateLinkblogRSSPage(db, blog),
      { flag: "wx" }
    );

    stdout.write("linkblog done\n");
  }

  if (!only || only.has("rss")) {
    await writeFileWithGzip(
      path.join(tmpFolder, "rss.xml"),
      await generateRSSPage(db, blog),
      { flag: "wx" }
    );

    stdout.write("rss done\n");
  }

  if (!only || only.has("archive")) {
    await writeFileWithGzip(
      path.join(tmpFolder, "archive.html"),
      await generateArchivePage(db, blog),
      { flag: "wx" }
    );

    stdout.write("archive done\n");
  }

  if (!only || only.has("media")) {
    const media = await db.all("SELECT id from media");

    for (const mediaChunk of chunk(media, 16)) {
      await db
        .all(
          `SELECT * from media WHERE id IN (${mediaChunk
            .map((s) => `"${s.id}"`)
            .join(",")})`
        )
        .then((loaded) =>
          Promise.all(
            loaded.map(async (m) =>
              fsPromises.writeFile(
                path.join(tmpFolder, "media", `${m.id}.${m.ext}`),
                m.data
              )
            )
          )
        );
    }

    stdout.write("media done\n");

    const convertedMedia = await db.all("SELECT id from converted_media");

    for (const convertedMediaChunk of chunk(convertedMedia, 16)) {
      await db
        .all(
          `SELECT * from converted_media WHERE id IN (${convertedMediaChunk
            .map((c) => `"${c.id}"`)
            .join(",")})`
        )
        .then((loaded) =>
          Promise.all(
            uniq(
              loaded.map((c) => path.join(tmpFolder, "media", c.media_id))
            ).map(mkdirP)
          ).then(() => loaded)
        )
        .then((loaded) =>
          Promise.all(
            loaded.map(async (c) =>
              fsPromises.writeFile(
                path.join(tmpFolder, "media", c.media_id, `${c.tag}.${c.ext}`),
                c.data
              )
            )
          )
        );
    }

    stdout.write("converted_media done\n");
  }

  await new Promise((resolve, reject) => {
    const rsync = new Rsync()
      .set("progress")
      .flags("Icru")
      .source(tmpFolder + path.sep)
      .destination(destination);

    if (!only) {
      rsync.set("delete");
    }

    rsync.execute(
      function (error) {
        if (error) {
          return reject(error);
        }

        return resolve();
      },
      (d) => stdout.write(d.toString() + "\n"),
      (d) => stderr.write(d.toString() + "\n")
    );
  });

  rmrf(tmpFolder);
}

function start({ only, stdout, stderr } = {}) {
  sqlite
    .open({ filename: POSTS_DB, driver: sqlite3.Database })
    .then((db) => loadIcu(db))
    .then((db) =>
      db
        .migrate({
          migrationsPath: path.resolve(__dirname, "migrations/posts"),
        })
        .then(() =>
          generate(
            db,
            DIST,
            stdout || process.stdout,
            stderr || process.stderr,
            { only }
          )
        )
        .then(() => {
          console.log("done");
          return db.close().then(() => {
            process.exit(0);
          });
        })
        .catch((err) => {
          console.error(err);
          return db.close().then(() => {
            process.exit(1);
          });
        })
    );
}

if (require.main === module) {
  start();
} else {
  module.exports = {
    generate,
    start,
  };
}
