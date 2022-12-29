const httpSignature = require("http-signature");

const fetchModule = import("node-fetch");

const { getBlogObject } = require("../common.js");

const { createMessage, attemptDelivery } = require("./outbox.js");

module.exports = inbox;

const AS_CONTEXT = "https://www.w3.org/ns/activitystreams";

async function inbox(req, res) {
  const context = req.post?.["@context"];

  if (
    !context || typeof context === "string"
      ? context !== AS_CONTEXT
      : !context.some((v) => v === AS_CONTEXT)
  ) {
    res.statusCode = 400;

    return { detail: "invalid @context" };
  }

  if (!req.headers.authorization && !req.headers.signature) {
    res.statusCode = 401;
    return { detail: "missing http signature" };
  }

  if (!(await getInboxActor(req))) {
    res.statusCode = 404;
    return { detail: "inbox not found" };
  }

  if (!(await verify(req))) {
    // early exit for deleting unknown actors/activity
    if (req.post.type === "Delete") {
      res.statusCode = 200;

      return;
    }

    res.statusCode = 401;
    return { detail: "invalid signature" };
  }

  switch (req.post.type) {
    case "Follow":
      return handleFollow(req, res);
    case "Announce":
      return handleAnnounce(req, res);
    case "Like":
      return handleLike(req, res);
    case "Create":
      return handleCreate(req, res);
    case "Undo":
      return handleUndo(req, res);
    case "Delete":
      return handleDelete(req, res);
    case "Update":
      // TODO
      break;
    case "Move":
      // TODO
      break;
    case "Read":
      // TODO
      break;
  }

  res.statusCode = 400;
  return { detail: "unknown activity type" };
}

async function getInboxActor(req) {
  const blog = await getBlogObject();

  if (req.url === "/actor/inbox" || req.url === "/activitystreams/inbox") {
    // might be not enough… maybe, remove shared inboxes altogether?

    const object = normalizeActor(req.post.object);

    if (
      object === blog.activitystream.id ||
      object === blog.linkblog.activitystream.id
    ) {
      return object;
    }

    if (req.post.type === "Create") {
      const to = req.post.to?.length ? req.post.to : [];
      const cc = req.post.cc?.length ? req.post.cc : [];

      return [...to, ...cc].find(
        (id) =>
          id === blog.activitystream.id ||
          id === blog.linkblog.activitystream.id
      );
    }

    return null;
  }

  if (
    req.url === "/actor/blog/inbox" ||
    req.url === "/activitystreams/blog/inbox"
  ) {
    return blog.activitystream.id;
  }

  if (
    req.url === "/actor/linkblog/inbox" ||
    req.url === "/activitystreams/linkblog/inbox"
  ) {
    return blog.linkblog.activitystream.id;
  }

  return null;
}

async function verify(req) {
  let sigHead;

  try {
    sigHead = httpSignature.parseRequest(req);
  } catch (e) {
    return false;
  }

  const cachedKey = await getCachedPublicKey(await req.asdb(), sigHead.keyId);

  if (cachedKey && httpSignature.verifySignature(sigHead, cachedKey)) {
    return true;
  }

  // early exit for deleting unknown actors/activity
  if (req.post.type === "Delete") {
    return false;
  }

  const actor = req.post.actor;

  if (!actor) {
    return false;
  }

  const freshKey = await getFreshKey(await req.asdb(), actor);

  if (!freshKey) {
    return false;
  }

  return httpSignature.verifySignature(sigHead, freshKey);
}

async function getCachedPublicKey(asdb, keyId) {
  const { public_key } =
    (await asdb.get("SELECT public_key FROM actors WHERE key_id = ?1;", {
      1: keyId,
    })) || {};

  return public_key || null;
}

async function getFreshKey(asdb, actorId) {
  const { default: fetch } = await fetchModule;
  const keyResponse = await fetch(actorId, {
    headers: {
      accept: "application/json",
    },
  });

  if (keyResponse.statusCode >= 400) {
    return null;
  }

  const actor = await keyResponse.json();

  if (!actor?.id || !actor.publicKey?.id || !actor.publicKey.publicKeyPem) {
    return null;
  }

  await asdb.run(
    `INSERT INTO actors (
      id,
      key_id,
      public_key,

      inbox,
      shared_inbox,
      name,
      url,
      icon
    ) VALUES (
      ?1,
      ?2,
      ?3,

      ?4,
      ?5,
      ?6,
      ?7,
      ?8
    ) ON CONFLICT DO
    UPDATE SET
      key_id = ?2,
      public_key = ?3,

      inbox = ?4,
      shared_inbox = ?5,
      name = ?6,
      url = ?7,
      icon = ?8
    WHERE id = ?1;`,
    {
      1: actor.id,
      2: actor.publicKey.id,
      3: actor.publicKey.publicKeyPem,
      4: actor.inbox,
      5: actor.endpoints?.sharedInbox,
      6: actor.name || actor.preferredUsername,
      7: actor.url,
      8: actor.icon?.type === "Image" ? actor.icon?.url : undefined,
    }
  );

  return actor.publicKey.publicKeyPem;
}

async function handleFollow(req, res) {
  /*
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "id": "https://mastodon.devua.club/a6661b47-64f7-4a44-894f-42f9833343ab",
      "type": "Follow",
      "actor": "https://mastodon.devua.club/users/zemlanin",
      "object": "https://zemlan.in/actor/blog"
    }
  */
  const { id, type, actor, object } = req.post;

  try {
    new URL(normalizeActor(actor));
  } catch (e) {
    res.statusCode = 400;
    return { detail: "actor has to be an uri" };
  }

  const inboxActor = await getInboxActor(req);

  if (normalizeActor(object) !== inboxActor) {
    res.statusCode = 404;
    return { detail: "object not found" };
  }

  const asdb = await req.asdb();
  await storeInboxMessage(asdb, {
    id,
    type,
    actor_id: normalizeActor(actor),
    object_id: inboxActor,
  });

  await sendAcceptMessage(asdb, {
    sender: inboxActor,
    receiver: normalizeActor(actor),
    object: id,
  });
}

async function handleAnnounce(req, res) {
  // TODO
  console.log(req.post);

  res.statusCode = 400;
  return { detail: "unknown activity type" };
}

async function handleLike(req, res) {
  /*
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "id": "https://mastodon.devua.club/users/zemlanin#likes/222",
      "type": "Like",
      "actor": "https://mastodon.devua.club/users/zemlanin",
      "object": "https://zemlan.in/actor/blog/notes/post-2022-11-Ls4QTeY41Z"
    }
  */
  const { id, type, actor, object } = req.post;

  try {
    new URL(normalizeActor(actor));
  } catch (e) {
    res.statusCode = 400;
    return { detail: "actor has to be an uri" };
  }

  let objectURL;

  try {
    objectURL = new URL(object?.id || object);
  } catch (e) {
    res.statusCode = 400;
    return { detail: "object or object.id has to be an uri" };
  }

  const db = await req.db();
  if (!(await getPostFromActivityStreamURL(db, objectURL))) {
    res.statusCode = 404;
    return { detail: "object not found" };
  }

  const asdb = await req.asdb();
  await storeInboxMessage(asdb, {
    id,
    type,
    actor_id: normalizeActor(actor),
    object_id: objectURL.toString(),
  });
}

async function handleCreate(req, res) {
  /*
    {
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        {
          ostatus: 'http://ostatus.org#',
          atomUri: 'ostatus:atomUri',
          inReplyToAtomUri: 'ostatus:inReplyToAtomUri',
          conversation: 'ostatus:conversation',
          sensitive: 'as:sensitive',
          toot: 'http://joinmastodon.org/ns#',
          votersCount: 'toot:votersCount'
        }
      ],
      id: 'https://mastodon.devua.club/users/zemlanin/statuses/109596632233808512/activity',
      type: 'Create',
      actor: 'https://mastodon.devua.club/users/zemlanin',
      published: '2022-12-29T11:04:53Z',
      to: [ 'https://7840-139-47-36-230.eu.ngrok.io/actor/blog' ],
      cc: [],
      object: {
        id: 'https://mastodon.devua.club/users/zemlanin/statuses/109596632233808512',
        type: 'Note',
        summary: null,
        inReplyTo: 'https://7840-139-47-36-230.eu.ngrok.io/actor/blog/notes/post-2020-03-ontN1uSG6j',
        published: '2022-12-29T11:04:53Z',
        url: 'https://mastodon.devua.club/@zemlanin/109596632233808512',
        attributedTo: 'https://mastodon.devua.club/users/zemlanin',
        to: [ 'https://7840-139-47-36-230.eu.ngrok.io/actor/blog' ],
        cc: [],
        sensitive: false,
        atomUri: 'https://mastodon.devua.club/users/zemlanin/statuses/109596632233808512',
        inReplyToAtomUri: 'https://7840-139-47-36-230.eu.ngrok.io/actor/blog/notes/post-2020-03-ontN1uSG6j',
        conversation: 'tag:devua.club,2022-12-29:objectId=34984:objectType=Conversation',
        content: '<p><span class="h-card"><a href="https://7840-139-47-36-230.eu.ngrok.io/" class="u-url mention">@<span>blog</span></a></span> test 2</p>',
        contentMap: {
          uk: '<p><span class="h-card"><a href="https://7840-139-47-36-230.eu.ngrok.io/" class="u-url mention">@<span>blog</span></a></span> test 2</p>'
        },
        attachment: [],
        tag: [ [Object] ],
        replies: {
          id: 'https://mastodon.devua.club/users/zemlanin/statuses/109596632233808512/replies',
          type: 'Collection',
          first: [Object]
        }
      }
    }
  */

  const { id, type, actor, object } = req.post;

  try {
    new URL(normalizeActor(actor));
  } catch (e) {
    res.statusCode = 400;
    return { detail: "actor has to be an uri" };
  }

  if (actor !== object.attributedTo) {
    res.statusCode = 400;
    return { detail: "actor must match object.attributedTo" };
  }

  try {
    new URL(object.id);
  } catch (e) {
    res.statusCode = 400;
    return { detail: "object.id has to be an uri" };
  }

  const asdb = await req.asdb();
  await storeInboxMessage(asdb, {
    id,
    type,
    actor_id: normalizeActor(actor),
    object_id: object.id,
  });

  const db = await req.db();
  const rootId = await getReplyRootId(db, asdb, object.inReplyTo);

  await storeReply(asdb, rootId, {
    "@context": req.post["@context"],
    ...object,
  });
}

async function getReplyRootId(db, asdb, inReplyTo) {
  if (!inReplyTo) {
    return null;
  }

  try {
    const inReplyToURL = new URL(inReplyTo);
    const inReplyToPost = await getPostFromActivityStreamURL(db, inReplyToURL);

    if (inReplyToPost) {
      return inReplyTo;
    }
  } catch (e) {
    return null;
  }

  const { root_id } =
    (await asdb.get(`SELECT root_id FROM replies WHERE id = ?1`, {
      1: inReplyTo,
    })) ?? {};

  return root_id ?? null;
}

async function handleUndo(req, res) {
  /*
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "id": "https://mastodon.devua.club/users/zemlanin#likes/222/undo",
      "type": "Undo",
      "actor": "https://mastodon.devua.club/users/zemlanin",
      "object": {
        "id": "https://mastodon.devua.club/users/zemlanin#likes/222",
        "type": "Like",
        "actor": "https://mastodon.devua.club/users/zemlanin",
        "object": "https://zemlan.in/actor/blog/notes/post-2022-11-Ls4QTeY41Z"
      }
    }
  */
  const { id, actor, object } = req.post;

  if (!object?.id) {
    res.statusCode = 400;
    return { detail: "nothing to undo" };
  }

  try {
    new URL(normalizeActor(actor));
  } catch (e) {
    res.statusCode = 400;
    return { detail: "actor has to be an uri" };
  }

  const asdb = await req.asdb();
  await asdb.run(`DELETE FROM inbox WHERE id = ?1 AND actor_id = ?2;`, {
    1: object.id,
    2: normalizeActor(actor),
  });

  if (object.type === "Follow") {
    const inboxActor = await getInboxActor(req);

    await sendAcceptMessage(asdb, {
      sender: inboxActor,
      receiver: normalizeActor(actor),
      object: id,
    });
  }
}

async function handleDelete(req, res) {
  /*
    {
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        { ostatus: 'http://ostatus.org#', atomUri: 'ostatus:atomUri' }
      ],
      id: 'https://mastodon.devua.club/users/zemlanin/statuses/109596627840095661#delete',
      type: 'Delete',
      actor: 'https://mastodon.devua.club/users/zemlanin',
      to: [ 'https://www.w3.org/ns/activitystreams#Public' ],
      object: {
        id: 'https://mastodon.devua.club/users/zemlanin/statuses/109596627840095661',
        type: 'Tombstone',
        atomUri: 'https://mastodon.devua.club/users/zemlanin/statuses/109596627840095661'
      }
    }
  */

  const { actor, object } = req.post;

  if (!object?.id) {
    res.statusCode = 400;
    return { detail: "nothing to undo" };
  }

  try {
    new URL(normalizeActor(actor));
  } catch (e) {
    res.statusCode = 400;
    return { detail: "actor has to be an uri" };
  }

  const asdb = await req.asdb();
  await asdb.run(`DELETE FROM inbox WHERE id = ?1 AND actor_id = ?2;`, {
    1: object.id,
    2: normalizeActor(actor),
  });
}

function normalizeActor(actor) {
  return typeof actor === "string" ? actor : actor?.id;
}

async function storeInboxMessage(asdb, message) {
  await asdb.run(
    `INSERT INTO inbox (
      id,
      actor_id,
      type,
      object_id
    ) VALUES (
      ?1,
      ?3,
      ?4,
      ?5
    ) ON CONFLICT DO
    UPDATE SET
      actor_id = ?3,
      type = ?4,
      object_id = ?5
    WHERE id = ?1;`,
    {
      1: message.id,
      3: message.actor_id,
      4: message.type,
      5: message.object_id,
    }
  );
}

async function storeReply(asdb, rootId, note) {
  await asdb.run(
    `
      INSERT INTO replies (id, published, actor_id, root_id, object)
      VALUES (?1, ?2, ?3, ?4, ?5)
    `,
    {
      1: note.id,
      2: note.published,
      3: note.attributedTo,
      4: rootId,
      5: JSON.stringify(note),
    }
  );
}

async function getPostFromActivityStreamURL(db, url) {
  const blog = await getBlogObject();
  const { hostname, pathname } = url;

  if (new URL(blog.url).hostname !== hostname) {
    return null;
  }

  const [_full, actorName, noteId] =
    pathname.match(/^\/actor\/([a-z0-9_-]+)\/notes\/([a-z0-9_-]+)$/i) ?? [];

  if (actorName === "blog") {
    const post = await db.get(
      `
        SELECT id FROM posts
        WHERE id = ?1
          AND draft = 0 AND internal = 0 AND private = 0
      `,
      { 1: noteId }
    );

    return post || null;
  }

  if (actorName === "linkblog") {
    const post = await db.get(
      `
        SELECT id FROM linklist
        WHERE id = ?1
          AND draft = 0 AND internal = 0 AND private = 0
      `,
      { 1: noteId }
    );

    return post || null;
  }

  return null;
}

async function sendAcceptMessage(asdb, { sender, receiver, object }) {
  const { inbox, shared_inbox } = await asdb.get(
    `SELECT inbox, shared_inbox FROM actors WHERE id = ?1`,
    {
      1: receiver,
    }
  );

  if (!inbox && !shared_inbox) {
    return;
  }

  const id = await createMessage(asdb, {
    from: sender,
    to: receiver,
    type: "Accept",
    object,
  });

  await attemptDelivery(
    asdb,
    id,
    shared_inbox || inbox,
    process.stdout,
    process.stderr
  );
}
