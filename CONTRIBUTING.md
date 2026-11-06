# How to contribute

We'd love to accept your patches and contributions to this project.

## Before you begin

### Sign our Contributor License Agreement

Contributions to this project must be accompanied by a
[Contributor License Agreement](https://cla.developers.google.com/about) (CLA).
You (or your employer) retain the copyright to your contribution; this simply
gives us permission to use and redistribute your contributions as part of the
project.

If you or your current employer have already signed the Google CLA (even if it
was for a different project), you probably don't need to do it again.

Visit <https://cla.developers.google.com/> to see your current agreements or to
sign a new one.

### Review our community guidelines

This project follows
[Google's Open Source Community Guidelines](https://opensource.google/conduct/).

## Contribution process

### Code reviews

All submissions, including submissions by project members, require review. We
use GitHub pull requests for this purpose. Consult
[GitHub Help](https://help.github.com/articles/about-pull-requests/) for more
information on using pull requests.

### Development & verification

Before opening a pull request, run the verification checks locally:

```bash
# Run unit tests
npm test

# Run linter and formatter checks
npm run check

# Compile TypeScript
npm run build
```

## Releases

Releases are built and signed by GitHub Actions using npm OIDC Trusted Publishing and `npm stage publish`.

1. **Bump the version in a pull request**:
   Update the version in `package.json` and `package-lock.json` (either inside your feature PR or in a dedicated release PR) and merge it into `main`:
   ```bash
   npm version <patch|minor|major> --no-git-tag-version
   ```
2. **Tag `main` and push the tag**:
   Check out `main`, pull the merged commit, create a `v*` tag matching the version in `package.json`, and push the tag to `origin`:
   ```bash
   git checkout main
   git pull origin main
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. **Verify the GitHub Actions workflow**:
   Pushing a `v*` tag triggers [`.github/workflows/publish-to-npm-on-tag.yml`](.github/workflows/publish-to-npm-on-tag.yml) (which can also be triggered manually via `workflow_dispatch`). The workflow runs `npm run check`, `npm test`, and `npm run build`, then runs `npm stage publish --provenance --access public` to sign OIDC provenance and upload the package to npm's staging queue.
4. **Approve the staged release on npm**:
   A maintainer must open the [`trace-engine-cli` package page on npmjs.com](https://www.npmjs.com/package/trace-engine-cli) and approve the staged release with interactive 2FA to publish it publicly.
