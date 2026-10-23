# Contributing to krplot

Thanks for your interest! Bug reports, ideas and pull requests are welcome
on [GitHub](https://github.com/kbosirany/krplot.vscode/issues).

## Project layout

| Path | Content |
|------|---------|
| `extension.js` | Extension host: watches `~/.krplot/url`, polls httpgd, saves files, opens the separate window |
| `media/view.js` | Webview: toolbar, layouts, plot rendering, PNG rasterization |
| `media/view.css` | Webview styles (VS Code theme variables) |
| `media/plot.svg` | Icon of the panel view |
| `images/` | Marketplace icon and README screenshot |

There is no build step and no dependency: the extension is plain
JavaScript using the VS Code API only.

## Run from source

1. Clone the repository and open it in VS Code.
2. Press `F5` (*Run Extension*): a new VS Code window starts with the
   extension loaded.
3. In that window, open an R terminal (with the `.Rprofile` block of the
   README) and draw a plot.

Use *Developer: Reload Window* in the extension window after a change, and
*Developer: Open Webview Developer Tools* to debug the view.

## Package locally

```sh
npx @vscode/vsce package
code --install-extension krplot-<version>.vsix
```

## Guidelines

- Keep the code dependency-free and cross-platform (Linux, Windows,
  macOS, remote development).
- Keep lines to 80 characters when possible.
- Update `CHANGELOG.md` and, for user-visible changes, `README.md`.
