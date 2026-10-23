# Changelog

All notable changes to krplot are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/).

## [0.4.0] - 2026-10-23

First public release on the Visual Studio Marketplace.

### Added

- Marketplace metadata: icon, repository, categories, keywords.
- Complete documentation (setup, usage, settings, troubleshooting).
- Continuous integration: syntax checks and packaging on GitHub Actions.

## [0.3.0] - 2026-10-23

### Added

- **Device ratio** layout, now the default: keeps the ratio of the R
  device (`httpgd.width` × `httpgd.height`). The R side also writes the
  device size to `~/.krplot/url`.

## [0.2.0] - 2026-10-23

### Added

- Own plot viewer replacing the httpgd web client.
- Layouts: fill, keep ratio (presets or custom) and fixed size.
- Plot history with buttons and Left/Right keys.
- SVG and PNG export; remove one or all plots.
- Open the plots in a separate window or in the browser.

### Changed

- Renamed from `rplot-panel` to `krplot`; the URL file moved from
  `~/.rplot-panel/url` to `~/.krplot/url`.

## [0.1.0] - 2026-10-23

### Added

- R Plots view in the bottom panel showing the httpgd web client of the
  current R session.

[0.4.0]: https://github.com/kbosirany/krplot.vscode/releases/tag/v0.4.0
[0.3.0]: https://github.com/kbosirany/krplot.vscode/releases/tag/v0.3.0
[0.2.0]: https://github.com/kbosirany/krplot.vscode/releases/tag/v0.2.0
[0.1.0]: https://github.com/kbosirany/krplot.vscode/releases/tag/v0.1.0
