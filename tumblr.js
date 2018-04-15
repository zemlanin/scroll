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

async function importTumblrPosts() {
  const files = (await fs.readdir("./tumblr/")).filter(v =>
    v.endsWith(".json")
  ); //.slice(-5)

  const db = await sqlite.open("./posts.db");

  await db.run(`DELETE FROM posts WHERE id LIKE "tumblr%"`);

  for (const file of files) {
    const content = JSON.parse(
      (await fs.readFile("./tumblr/" + file)).toString()
    );

    const posts = content.response.posts.sort((a, b) => {
      if (a.created_at != b.created_at) {
        return a.created_at > b.created_at ? 1 : -1;
      }

      return a.id_str > b.id_str ? 1 : -1;
    });

    const blogName = content.response.blog.name;

    for (let post of posts) {
      const id = `tumblr-${blogName}-${post.id}`;
      const url = `http://${blogName}.tumblr.com/post/${post.id}`;

      if (await db.get("SELECT * FROM posts WHERE import_url = ?1", [url])) {
        continue;
      }

      if (post.reblog && post.reblog.tree_html) {
        continue;
      }

      const created = new Date(post.date).toISOString();

      let raw;
      let text;

      if (post.type === "text") {
        raw = post.body;
        text = post.body;
      } else if (post.type === "quote") {
        raw = post.text;
        text =
          post.text
            .split("\n")
            .map(v => "> " + v)
            .join("  \n") +
          "\n\n" +
          post.source;
      } else if (post.type === "chat") {
        raw = post.body;
        text = post.dialogue
          .map(v => "> " + v.name + ": " + v.phrase.split("\n").join("  \n> "))
          .join("  \n");
      } else if (post.type === "link") {
        raw =
          "[" + post.title + "](" + post.url + ")" + "\n\n" + post.description;
        text =
          "[" + post.title + "](" + post.url + ")" + "\n\n" + post.description;
        post.title = "";
      } else if (post.type === "photo") {
        text = "";
        raw = post.caption;

        for (const photo of post.photos) {
          let srcUrl = photo.original_size.url;

          try {
            const loaded = await loadMedia(srcUrl, db);
            srcUrl = `/media/${loaded.id}.${loaded.ext}`;
          } catch (e) {
            //
          }

          text = text + `\n\n![](${srcUrl})`;
        }

        if (post.link_url) {
          text =
            text +
            "\n\n" +
            `[${post.source_title || post.link_url}](${post.link_url})`;
        }

        if (post.caption) {
          text = text + "\n\n" + post.caption;
        }

        text = text.trim();
      } else if (post.type === "video") {
        text = "";

        if (post.video && post.video.youtube && post.video.youtube.video_id) {
          text = `![](https://www.youtube.com/embed/${
            post.video.youtube.video_id
          })`;
        } else if (
          post.source_url &&
          post.source_url.indexOf("//t.umblr.com/redirect") > -1 &&
          post.source_url.indexOf("www.youtube.com%2Fwatch%3Fv%3D") > -1
        ) {
          const youtubeId = post.source_url.match(
            /www\.youtube\.com%2Fwatch%3F([^&]+)/
          )[1];

          text = `![](https://www.youtube.com/embed/${youtubeId})`;
        } else if (post.video_type === "vimeo" && post.permalink_url) {
          text = `![](${post.permalink_url})`;
        } else if (post.video_type === "funny_or_die" && post.permalink_url) {
          text = `![](${post.permalink_url})`;
        } else if (
          post.player &&
          post.player.find(
            p =>
              p.embed_code &&
              p.embed_code.indexOf("media.kino-govno.com/movies") > -1
          )
        ) {
          const srcUrl = post.player
            .find(p => p.embed_code.indexOf("media.kino-govno.com/movies") > -1)
            .embed_code.match(
              /https?:\/\/media\.kino-govno\.com\/movies\/[^&]+\.mp4/
            );

          if (!srcUrl) {
            continue;
          }

          text = `<video src="${srcUrl}" controls></video>`;
        } else if (
          post.player &&
          post.player.every(p => p.embed_code === false) &&
          post.caption
        ) {
          //
        } else if (
          post.player &&
          post.player.every(p => p.embed_code.indexOf("qik.com") > -1)
        ) {
          text =
            "_тут было какое-то видео с qik.com, которое потерялось после их продажи_";
        } else if (post.id === 59835030) {
          text = `![](https://www.youtube.com/embed/fQ6rg-9dncI)`;
        } else if (post.id === 44197891) {
          text = `![Scars on Broadway - Funny](https://www.youtube.com/embed/z3YPjOw-hbg)`;
        } else if (post.id === 42117765) {
          text = `![The Teenagers - Bound And Gagged](https://www.youtube.com/embed/-1ZNrRFUW5M)`;
        } else if (post.id === 38408419) {
          text = `![Muse - House Of The Rising Sun](https://www.youtube.com/watch?v=4DPDpz-m0xg)`;
        } else if (post.id === 36211024) {
          text = `![Jose Gonzalez - Teardrop](https://www.youtube.com/watch?v=_6rIks03cdM)`;
        } else if (post.id === 35899942) {
          text = `![Fair to Midland - Walls of Jericho](https://www.youtube.com/watch?v=IhFJvIZfB_s)`;
        } else if (post.id === 55403100) {
          text = `[Blogcamp 2008 - Google Photos](https://photos.google.com/share/AF1QipP4qVgZFWLHW_7Kx8Lrbffac5rccC3SwmiHDU5WSSOBjL6mf-oMCt4VpAKNs5-f5A?key=Z2k3LUwyRDJiT3JNNy1tMGh0WDNheDRUR0dvZlZR)`;
        } else if (
          post.id === 55988550 ||
          post.id === 46677317 ||
          post.id === 35105624
        ) {
          continue;
        } else if (post.id === 47937057) {
          text = `![](https://vimeo.com/1627157)`;
        } else if (post.id === 40794822) {
          text = "[Я.Видео](http://flv.video.yandex.ru/lite/harm/o5q4lcrpwk.1)";
        } else if (post.id === 37509127) {
          text =
            "[Афиша](http://www.afisha.ru/Afisha7files/Trailer/2008/06/mummy.flv)";
        } else if (
          post.id === 51225662 ||
          post.id === 48551763 ||
          post.id === 46508011 ||
          post.id === 44071917 ||
          post.id === 39305867 ||
          post.id === 37016841
        ) {
          //
        } else {
          console.log(post);
          process.exit(1);
        }

        if (post.caption) {
          text = text + "\n\n" + post.caption;
        }

        text = text.trim();
        raw = text;
      } else if (post.type === "audio") {
        if (post.audio_type === "soundcloud" && post.player) {
          text = post.player;
          // <iframe width="100%" height="300" scrolling="no" frameborder="no" allow="autoplay" src="https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/55498980"></iframe>
        } else if (post.audio_url.indexOf("dropbox.com/u/82083") > -1) {
          let srcUrl = post.audio_url
            .replace(/%20/g, " ")
            .replace(/%27/g, "'")
            .replace(/%21/g, "!")
            .replace(/%2C/g, ",")
            .replace(/%26/g, "&")
            .replace(/%28/g, "(")
            .replace(/%29/g, ")");
          const filepath =
            `/Users/antonverinov/Dropbox/Public/` +
            srcUrl.slice(srcUrl.indexOf("82083/") + 6);

          try {
            const loaded = await openFileMedia(srcUrl, filepath, db);
            srcUrl = `/media/${loaded.id}.${loaded.ext}`;
          } catch (e) {
            console.error(e);
            console.log({
              id: post.id,
              post_url: post.post_url,
              caption: post.caption,
              player: post.player,
              embed: post.embed,
              audio_url: post.audio_url,
              audio_source_url: post.audio_source_url,
              audio_type: post.audio_type
            });
            process.exit(1);
          }

          text = `<audio src="${srcUrl}" controls></audio>`;
        } else if (post.audio_url.indexOf("tumblr.com/audio_file/zem") > -1) {
          let srcUrl = post.audio_url;

          try {
            const loaded = await loadMedia(srcUrl, db, "mp3");
            srcUrl = `/media/${loaded.id}.${loaded.ext}`;
          } catch (e) {
            //
          }

          text = `<audio src="${srcUrl}" controls></audio>`;
        } else if (post.id === 105854478678) {
          text =
            "![Will of Fire - Omnitica](https://www.youtube.com/watch?v=ZufZFUTyFK8)";
        } else if (post.id === 22374274217) {
          text =
            "![Stereophonics - Maybe Tomorrow](https://www.youtube.com/watch?v=2q9_ZEtuTR8)";
        } else if (post.id === 20731584560) {
          text =
            "![Deadly Game - Theory of a Deadman](https://www.youtube.com/watch?v=JiH7scb0qRE)";
        } else if (post.id === 1488012272) {
          text =
            "![Sleazy Bed Track — The Bluetones](https://www.youtube.com/watch?v=z9ZIJxqPp5s)";
        } else if (post.id === 749858468) {
          text =
            "![Emilie Autumn — Opheliac](https://www.youtube.com/watch?v=IpJkCti8IL0)";
        } else if (post.id === 503438419) {
          text =
            "![Flyleaf — Beautiful Bride](https://www.youtube.com/watch?v=XfW4CkYrjXs)";
        } else if (post.id === 550506987) {
          text =
            "![Five Finger Death Punch — Hard to See](https://www.youtube.com/watch?v=otsMXq-1xQw)";
        } else if (post.id === 173042987) {
          text = "🎵";
        } else if (post.id === 380183495) {
          text =
            "[Un-Tik-Tokked Desires (Muse vs. Kesha)](http://www.mashstix.com/001440)";
        } else if (post.id === 151446446) {
          text =
            "![Little Boots - New In Town](https://www.youtube.com/watch?v=kUs9YzY7t-8)";
        } else if (post.id === 143517906) {
          text =
            "![Iris - The Goo Goo Dolls](https://www.youtube.com/watch?v=NdYWuo9OFAw)";
        } else if (post.id === 112000133) {
          text =
            "![The Rolling Stones - As Tears Go By](https://www.youtube.com/watch?v=lQlmywY_qEM)";
        } else if (post.id === 138397145) {
          text =
            "![Imogen Heap — Hide and Seek](https://www.youtube.com/watch?v=UYIAfiVGluk)";
        } else if (post.id === 213841478) {
          text = "";
        } else if (post.id === 75344358) {
          text =
            "![George Harrison - Got My Mind Set On You](https://www.youtube.com/watch?v=6ZwjdGSqO0k)";
        } else if (post.id === 73570228) {
          text =
            "![Дом Кукол — Твари Цвета Ультрамарин](https://www.youtube.com/watch?v=S9qJQCmgkaw)";
        } else if (post.id === 44529901) {
          text =
            "![Coldplay — Viva la Vida](https://www.youtube.com/watch?v=dvgZkm1xWPE)";
        } else if (post.id === 43801317) {
          text =
            "_тут было какое-то аудио с drop.io, которое потерялось после их заката";
        } else if (post.id === 36235187) {
          text =
            '_тут был подкаст, который хостился на rpod.ru, который потерялся после того, как Стрельников решил что "время подкаст-терминалов давно прошло"';
        } else {
          console.log({
            id: post.id,
            post_url: post.post_url,
            caption: post.caption,
            player: post.player,
            embed: post.embed,
            audio_url: post.audio_url,
            audio_source_url: post.audio_source_url,
            audio_type: post.audio_type
          });
          process.exit(1);
        }

        if (post.caption) {
          text = text + "\n\n" + post.caption;
        }

        text = text.trim();
        raw = text;
      } else {
        continue;
      }

      if (post.title && post.title.trim()) {
        text = "# " + post.title.trim() + "\n" + text;
      }

      const mediaTumblrUrls = text.match(
        /https?:\/\/(\d+\.)?media\.tumblr\.com\/tumblr_[a-zA-Z0-9]+\.(png|jpg|jpeg|gif)/g
      );
      if (mediaTumblrUrls) {
        for (const srcUrl of mediaTumblrUrls) {
          try {
            const loaded = await loadMedia(srcUrl, db);
            text = text.replace(srcUrl, `/media/${loaded.id}.${loaded.ext}`);
          } catch (e) {
            //
          }
        }
      }

      const publicDropboxUrls = text.match(
        /https?:\/\/([a-z.-]*)dropbox\.com\/u\/82083\/([a-zA-Z0-9/_-]+\.[a-z0-9]{3,4})/g
      );
      if (publicDropboxUrls) {
        for (const srcUrl of publicDropboxUrls) {
          const filepath =
            `/Users/antonverinov/Dropbox/Public/` +
            srcUrl.slice(srcUrl.indexOf("82083/") + 6);

          try {
            const loaded = await openFileMedia(srcUrl, filepath, db);
            text = text.replace(srcUrl, `/media/${loaded.id}.${loaded.ext}`);
          } catch (e) {
            console.log(e);
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
