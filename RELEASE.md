# Releasing ConsCell

The steps for a tagged release, written for `1.0.0-beta.0` and reusable
for the next ones. `dev` is the integration branch, `main` the release
branch; a release is a pull request `dev` → `main` merged when green,
tagged on the merge commit.

## 0. Before the release sprint

- [ ] The version in `app/package.json` is the release version (the
      code-cut sprint bumps it; it flows into the boot screen, About and
      the service-worker cache name through `__APP_VERSION__`).
- [ ] `CHANGELOG.md` has the release entry with today's date.
- [ ] The last merge commit on `dev` has both CI jobs green (`check`
      and `smoke`).

## 1. Verify `dev` locally

```sh
cd app
pnpm install --frozen-lockfile
pnpm lint && pnpm build && pnpm test          # 17 suites
node scripts/boot-harness.mjs --exercise      # ECL + the cl-plot sample
pnpm preview --port 4173 &                    # then, in another shell:
node scripts/browser-smoke.mjs --json dist/smoke-report.json   # 11 scenarios
```

- [ ] Boot screen and About show `v<version>`; the browser's
      Application → Service Workers panel shows `sw.js?v=<version>`.
- [ ] Record the engine artifacts that ship:

```sh
ls -l app/public/sbcl/*.gz app/public/wecl/wecl.wasm
sha256sum app/public/sbcl/*.gz app/public/wecl/wecl.wasm
```

## 2. Release pull request

- [ ] `git fetch origin main dev`; branch `release/<version>` from
      `origin/dev`; open a pull request `release/<version>` → `main`
      titled `Release <version>` with the changelog entry as its body;
      label it `smoke` so both CI jobs run.
- [ ] Merge when green (merge commit, no squash: the sprint history
      stays readable).

## 3. Tag and GitHub release

```sh
git fetch origin main
git tag -a v<version> <merge-commit-sha> -m "ConsCell <version>"
git push origin v<version>
```

- [ ] Create the GitHub release from the tag; the notes are the
      changelog entry plus the artifact table from step 1 (sizes and
      hashes).
- [ ] Add the compare link at the bottom of `CHANGELOG.md` if it is not
      there yet.

## 4. Deploy

The site is `app/dist/` after `pnpm build`, served statically. The host
must send, on every response:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

Without them the page is not `crossOriginIsolated`, the SBCL engine
skips its boot and ECL takes over (the boot log says so). Also:

- [ ] `sw.js` is served at the site root next to `index.html`, with no
      long-lived cache header (`Cache-Control: no-cache` or a short
      max-age), so a new version's worker is picked up on the next visit.
- [ ] The `.gz` artifacts are served as-is (no transparent
      `Content-Encoding`), with a long cache lifetime; the worker
      inflates them itself.
- [ ] Every SPA route (`/ide`, `/docs`, `/examples`) serves
      `index.html`.

## 5. After the release

- [ ] From a fresh browser profile: the IDE boots SBCL, `About` shows
      the version, a reload with the network disabled still boots ECL
      (the service worker's cache).
- [ ] From a profile that had the previous version: the boot log shows
      the new artifacts downloading once; DevTools → Application →
      Cache Storage lists only `conscell-<version>`.
- [ ] Back on `dev`: bump `app/package.json` to the next working
      version (for example `1.0.0-beta.1`) in the first sprint after
      the release.
