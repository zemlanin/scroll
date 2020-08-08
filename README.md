# scroll

## optional dependencies
- `ffmpeg` for `gif -> mp4` encoding and generating `firstframe` previews

## docker stuff
```
docker run \
  -p 8000:8000 \
  -eBLOG_BASE_URL=<public url> \
  -eJWT_SECRET=<random string> \
  -eGITHUB_APP_ID=<github api app id> \
  -eGITHUB_APP_SECRET=<github api app secret> \
  -eGITHUB_USER_ID=<github user id> \
  -v <path/to/posts/database>:/db/posts \
  -v <path/to/sessions/database>:/db/sessions \
  -v <path/to/built/blog>:/dist \
  zemlanin/scroll
```

---

or save env vars to `.env`:

```
BLOG_BASE_URL=<public url>
JWT_SECRET=<random string>
GITHUB_APP_ID=<github api app id>
GITHUB_APP_SECRET=<github api app secret>
GITHUB_USER_ID=<github user id>
```

and then run via

```
docker run \
  -p 8000:8000 \
  --env-list .env \
  -v <path/to/posts/database>:/db/posts \
  -v <path/to/sessions/database>:/db/sessions \
  -v <path/to/built/blog>:/dist \
  zemlanin/scroll
```
