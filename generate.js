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

async function copyStaticContent(destination, stdout) {
  const staticPath = path.resolve(__dirname, "static");

  for (const filename of await fsPromises.readdir(staticPath)) {
    if (filename && filename[0] == ".") {
      continue;
    }

    const filepath = path.resolve(staticPath, filename);

    if ((await fsPromises.lstat(filepath)).isDirectory()) {
      throw new Error("copyStaticContent() doesn't support directories");
    }

    const mimeType = mime.getType(filename);
    stdout.write(`${filename} ${mimeType}\n`);

    if (
      mimeType.startsWith("text/") ||
      mime === "application/javascript" ||
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

async function generate(db, destination, stdout, stderr) {
  const tmpFolder = await fsPromises.mkdtemp(path.join(os.tmpdir(), "scroll-"));
  await fsPromises.mkdir(path.join(tmpFolder, "/media"));

  stdout.write(`made tmp dir: ${tmpFolder}\n`);

  await copyStaticContent(tmpFolder, stdout);

  const blog = await getBlogObject();

  let preparedPosts = await getPosts(db, {}, `draft = 0`, null);

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

        if (post.slug && post.id !== post.slug) {
          await writeFileWithGzip(
            path.join(tmpFolder, `${post.slug}.html`),
            renderedPage,
            { flag: "wx" }
          );
        }

        await writeFileWithGzip(
          path.join(tmpFolder, `${post.id}.html`),
          renderedPage,
          { flag: "wx" }
        );
      })
    );
  }

  stdout.write("\n");
  stdout.write("posts done\n");

  let pagination = await getPagination(db, null);
  let newestPage = pagination[0] || { index: 0, posts: [] };

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

  await writeFileWithGzip(
    path.join(tmpFolder, "index.html"),
    await generateIndexPage(db, blog, newestPage),
    { flag: "wx" }
  );

  newestPage = null;

  await writeFileWithGzip(
    path.join(tmpFolder, "rss.xml"),
    await generateRSSPage(db, blog),
    { flag: "wx" }
  );

  await writeFileWithGzip(
    path.join(tmpFolder, "archive.html"),
    await generateArchivePage(db, blog),
    { flag: "wx" }
  );

  stdout.write("archive done\n");

  preparedPosts = null;
  pagination = null;

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

  await new Promise((resolve, reject) => {
    const rsync = new Rsync()
      .set("progress")
      .set("delete")
      .flags("Icru")
      .source(tmpFolder + path.sep)
      .destination(destination);

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

function start() {
  sqlite
    .open({ filename: POSTS_DB, driver: sqlite3.Database })
    .then((db) => loadIcu(db))
    .then((db) =>
      db
        .migrate({ migrationsPath: path.resolve(__dirname, "migrations") })
        .then(() => generate(db, DIST, process.stdout, process.stderr))
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
