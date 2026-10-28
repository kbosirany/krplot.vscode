# krplot: R Plots pane for VS Code

A dedicated **R Plots** pane for VS Code, like the Plots and Viewer panes
of RStudio or Positron. Your R plots **and interactive HTML widgets**
(leaflet, plotly, DT, ...) are displayed in a view of their own (bottom
panel or side bar), never as tabs in the editor area.

![A plot in the R Plots view](https://raw.githubusercontent.com/kbosirany/krplot.vscode/main/images/screenshot.png)

![A leaflet map in the R Plots view](https://raw.githubusercontent.com/kbosirany/krplot.vscode/main/images/screenshot-widget.png)

## Features

- **A real Plots pane**: a view in the bottom panel that you can drag to
  the secondary side bar (or anywhere else); VS Code remembers where you
  put it. No more plot tabs mixed with your scripts.
- **Static and interactive output in one place**:
  - plots drawn on the R graphics device (base, ggplot2, lattice, ...);
  - HTML widgets and pages sent to the R viewer (leaflet, plotly, DT,
    dygraphs, visNetwork, gt, ...). Widgets stay interactive and keep
    their state (zoom, pan, selection) when you browse the history.
- **History**: browse plots and widgets with the ◀ ▶ buttons or the
  Left/Right keys. New output is shown as soon as it is produced.
- **Size and aspect ratio control**, from the toolbar menu:

  | Mode | Behaviour |
  |------|-----------|
  | **Device ratio** (default) | Keeps the ratio of the R device (720 × 576 px unless set otherwise), fitted to the view |
  | **Fill** | Takes the whole view |
  | **Keep ratio** | 16:9, 4:3, 3:2, 1:1, 3:4, A4 portrait, A4 landscape or a custom ratio, fitted to the view |
  | **Fixed size** | Laid out at exact pixels (as when saved), scaled down to fit the view |

  Plots are re-rendered by R at the displayed size (not stretched), so
  text stays sharp and readable; widgets are laid out at that size too.
  The size is shown on the right of the toolbar. The choice is remembered
  and shared by all R Plots views.
- **Export** the current plot as **SVG** or **PNG**.
- **Remove** the current item or **clear** the history.
- **Separate window**: open the pane in its own window, for example on a
  second screen.
- **Open in browser**: open the current plot or widget in your browser.
- **Remote development**: works with Dev Containers, WSL and Remote SSH
  (ports are forwarded automatically).
- **Cross-platform**: Linux, Windows and macOS.

## Installation

Install **krplot** from the Extensions view of VS Code, or build it from
source.

### From source

You need [Node.js](https://nodejs.org/) (18 or later) and Git. There is no
dependency to install and nothing to compile:

```sh
git clone https://github.com/kbosirany/krplot.vscode.git
cd krplot.vscode
npx @vscode/vsce package
```

This creates `krplot-<version>.vsix` in the folder. Install it with:

```sh
code --install-extension krplot-<version>.vsix
```

or from VS Code: *Extensions* view > *...* menu > *Install from VSIX...*.
Then reload the window.

The `.vsix` of each commit on `main` is also built by the CI: download the
`krplot-vsix` artifact from the run in the *Actions* tab of the
repository.

## Requirements

- [R](https://www.r-project.org/) with the
  [httpgd](https://cran.r-project.org/package=httpgd) package (for
  plots):

  ```r
  install.packages("httpgd")
  ```

- An R session running in a VS Code terminal (R, radian, or the terminal
  of the [R extension](https://marketplace.visualstudio.com/items?itemName=REditorSupport.r)).

The R extension (vscode-R) is not required, but works well alongside
krplot.

## Setup

### 1. Load krplot in R

The extension installs its R side in `~/.krplot/init.R` (and keeps it up
to date). Load it from your `~/.Rprofile` (open it with
`usethis::edit_r_profile()` or `file.edit("~/.Rprofile")`):

```r
# krplot: R plots and HTML widgets in the VS Code R Plots view
local({
  home <- Sys.getenv(
    if (.Platform$OS.type == "windows") "USERPROFILE" else "HOME"
  )
  init <- file.path(home, ".krplot", "init.R")
  if (
    interactive() &&
      Sys.getenv("TERM_PROGRAM") == "vscode" &&
      Sys.getenv("POSITRON_VERSION") == "" &&
      file.exists(init)
  ) {
    source(init)
  }
})
```

It only applies to interactive R sessions started in a VS Code terminal
(not Positron, not scripts run with `Rscript`). It makes httpgd the
graphics device and sets the R viewer, so that plots and widgets go to the
pane.

### 2. If you use the R extension (vscode-R)

vscode-R starts its own plot viewer in the editor area, after your
`.Rprofile` has run. Make it leave the graphics device to krplot, in your
VS Code `settings.json`:

```json
"r.plot.backend": "native"
```

krplot takes over the R viewer from vscode-R automatically, so HTML
widgets go to the pane too. It also shows a notification to set
`r.plot.backend` for you when vscode-R is installed and this setting is
missing.

### 3. Draw something

Open a **new** R terminal (the `.Rprofile` is read at startup) and run:

```r
plot(1:10)
leaflet::addTiles(leaflet::leaflet())
```

The **R Plots** view opens in the bottom panel. Drag its tab to the
secondary side bar (*View > Appearance > Secondary Side Bar*) to get an
RStudio-like layout.

## Usage

### Toolbar

| Control | Action |
|---------|--------|
| ◀ / ▶ (or Left / Right) | Previous / next item |
| `n / N` | Position in the history |
| Size menu | Device ratio, fill, fixed ratio or fixed size (see above) |
| `W × H` fields | Custom ratio or fixed size, shown when selected |
| SVG / PNG | Save the current plot (plots only) |
| ↗ | Open the current item in the browser |
| 🗑 | Remove the current item |
| ✕ | Clear the history |
| `W × H px` | Size of the current item (and widget name) |

### View title buttons and commands

| Command | Description |
|---------|-------------|
| `R Plots: Open in Separate Window` | Show the pane in a separate window |
| `R Plots: Open in Browser` | Open the httpgd viewer in the browser |
| `R Plots: Reload` | Reconnect to the latest R session |

### Device size

The default **Device ratio** mode uses the size of the httpgd device,
720 × 576 px (5:4) unless you change it. To use another ratio, set these
options in your `.Rprofile`, before the krplot block:

```r
options(httpgd.width = 800, httpgd.height = 450) # 16:9
```

### Export

- **SVG**: vector file, rendered by R at the current size.
- **PNG**: twice the current size for a sharp image, or exactly the given
  pixels in **Fixed size** mode. Use **Fixed size** to export a plot at a
  precise size.
- **Widgets**: use their own tools (for example the camera icon of
  plotly), or `htmlwidgets::saveWidget()` in R.

## Extension settings

| Setting | Default | Description |
|---------|---------|-------------|
| `krplot.revealOnNewSession` | `true` | Reveal the R Plots view when an R session opens its first plot or shows a widget |
| `krplot.pollInterval` | `400` | Interval (ms) between checks of the R session for new plots |

## How it works

- **Plots**: when R opens its first plot, `~/.krplot/init.R` starts an
  httpgd device (a local web server, on `127.0.0.1` only, protected by a
  random token) and writes its URL and size to `~/.krplot/url`. krplot
  polls httpgd for new plots and asks it to render the current one as SVG
  at the size the view needs.
- **HTML widgets**: R saves each widget as an HTML page in its temporary
  folder and calls the R viewer (`options(viewer = ...)`). krplot's viewer
  writes the page path to `~/.krplot/viewer`; the extension serves the
  page on `127.0.0.1` and shows it in the pane. When the extension is not
  running, widgets open in the browser as usual.

Nothing leaves your machine: krplot only talks to local servers (widgets
may load map tiles or fonts from the internet themselves).

## Troubleshooting

- **"Nothing to show yet"**: the R session was started before the
  `.Rprofile` block was added, or httpgd is not installed. Open a new R
  terminal and check `getOption("device")` returns a function.
- **Widgets open in an editor tab after an update to 0.5.0**: your
  `.Rprofile` still has the block of a previous version, which does not
  load `~/.krplot/init.R`. krplot warns about it at startup: replace it
  with the block of the [Setup](#1-load-krplot-in-r), then open a new R
  terminal.
- **Plots or widgets still open in an editor tab**: set `"r.plot.backend": "native"`
  (vscode-R), then open a new R terminal. Check that no workspace
  setting overrides it.
- **Plots open in an X11 or Quartz window**: check the `.Rprofile` ends
  with a newline after the last `}`; some R consoles (arf) drop a last
  line without one.
- **"R session not reachable"**: the R session displayed was closed. Draw
  a plot in another session, or run `R Plots: Reload`.
- **Several R sessions**: the pane shows the plots of the last session
  that opened a plot device. Run `dev.off()` then plot again in a session
  to show it. Widgets of all sessions are shown.
- **The size menu is not on Device ratio**: your last choice is
  remembered; select **Device ratio** again.

## Known limitations

- Plots of one R session are displayed at a time (the last one to open a
  device).
- Plots drawn with another device (`png()`, `pdf()`, ...) are not shown.
- Widgets are not kept after the R session ends (R deletes its temporary
  folder).
- Shiny apps open in the browser (as with `shiny::runApp()` by default).
- PNG export rasterizes the SVG in the view; fonts missing on your system
  are replaced.

## Contributing

Issues and pull requests are welcome on
[GitHub](https://github.com/kbosirany/krplot.vscode). See
[CONTRIBUTING.md](CONTRIBUTING.md) to run the extension from source.

## License

[MIT](LICENSE)
