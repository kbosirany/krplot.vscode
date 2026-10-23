# Publishing krplot

Maintainer notes to release a new version on the Visual Studio
Marketplace (and optionally Open VSX).

## One-time setup

1. **Publisher**: sign in to the
   [Marketplace management page](https://marketplace.visualstudio.com/manage)
   with a Microsoft account and create a publisher whose ID matches the
   `publisher` field of `package.json` (`kbosirany`). If you choose
   another ID, update `package.json`.
2. **Personal Access Token**: in [Azure DevOps](https://dev.azure.com),
   *User settings > Personal access tokens > New token*:
   - Organization: **All accessible organizations**;
   - Scopes: **Custom defined > Marketplace > Manage**.
3. Log in with vsce:

   ```sh
   npx @vscode/vsce login kbosirany
   ```

## Release

1. Update `version` in `package.json` and add the entry in
   `CHANGELOG.md`.
2. Check the package content and test it locally:

   ```sh
   npx @vscode/vsce ls
   npx @vscode/vsce package
   code --install-extension krplot-<version>.vsix
   ```

3. Commit, tag and push:

   ```sh
   git commit -am "chore: release <version>"
   git tag v<version>
   git push origin main --tags
   ```

4. Publish:

   ```sh
   npx @vscode/vsce publish
   ```

   Or upload the `.vsix` by hand on the management page (*New extension
   > Visual Studio Code*). The extension appears on the Marketplace after
   a few minutes of verification.

5. Optionally, create a GitHub release from the tag with the `.vsix`
   attached (also built by the CI as an artifact).

## Open VSX (VSCodium, Positron, Cursor...)

```sh
npx ovsx create-namespace kbosirany -p <open-vsx-token>
npx ovsx publish krplot-<version>.vsix -p <open-vsx-token>
```

Tokens are created at <https://open-vsx.org/user-settings/tokens>.
