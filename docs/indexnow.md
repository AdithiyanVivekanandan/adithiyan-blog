# IndexNow

IndexNow tells participating search engines — including Bing, Yandex and Naver — that canonical URLs changed. DuckDuckGo depends on Bing's index, so this also supports DuckDuckGo discovery.

The public key file is committed at `public/<key>.txt`. It contains no secret and must be deployed before submitting URLs.

## After a production deploy

```sh
npm run build
npm run indexnow:dry
npm run indexnow
```

`indexnow:dry` prints the exact payload without sending it. `indexnow` first verifies that the live key file matches `public/<key>.txt`, then posts the URLs from `dist/sitemap.xml` to `https://api.indexnow.org/indexnow`.

If the live key returns 404, the script stops and tells you to deploy the key file first. This prevents submitting URLs before the key is publicly verifiable.

The script rejects URLs outside `blog.adithiyan.me` and excludes the admin desk, search page and 404 page. Re-run it after publishing or materially updating an article.
