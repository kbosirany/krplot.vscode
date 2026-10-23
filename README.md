# krplot

VS Code extension adding a dedicated **R Plots** view, like the Plots pane
of RStudio or Positron. It shows the plots of the current R session
(httpgd device) outside the editor area.

The view opens in the bottom panel; drag its tab to the secondary sidebar
to keep it on the side. VS Code remembers the position.

## Features

- Plot history: previous/next buttons or Left/Right keys; new plots are
  shown as they are drawn.
- Plot size, shared by all views and remembered:
  - **Fill**: the plot takes the whole view;
  - **Keep ratio**: 16:9, 4:3, 3:2, 1:1, 3:4, A4 portrait/landscape or a
    custom ratio, fitted to the view;
  - **Fixed size**: rendered at exact pixels (as when saved), scaled down
    to fit the view.

  The rendered size is shown on the right of the toolbar.
- Save as SVG or PNG (PNG at twice the screen size, or at exact pixels in
  fixed size mode); remove one or all plots.
- View title buttons: open in a separate window (out of the main VS Code
  window), open the httpgd viewer in the browser, reload.

## Setup

1. In VS Code settings, stop vscode-R from opening its own plot viewer:

   ```json
   "r.plot.backend": "native"
   ```

2. In `~/.Rprofile`, use httpgd as the device and publish its URL:

   ```r
   if (
     interactive() &&
       Sys.getenv("TERM_PROGRAM") == "vscode" &&
       Sys.getenv("POSITRON_VERSION") == "" &&
       requireNamespace("httpgd", quietly = TRUE)
   ) {
     options(device = function(...) {
       httpgd::hgd(silent = TRUE)
       home <- Sys.getenv(
         if (.Platform$OS.type == "windows") "USERPROFILE" else "HOME"
       )
       dir <- file.path(home, ".krplot")
       dir.create(dir, showWarnings = FALSE)
       writeLines(httpgd::hgd_url(), file.path(dir, "url"))
     })
   }
   ```

3. Build and install:

   ```sh
   npx @vscode/vsce package --allow-missing-repository
   code --install-extension krplot-0.2.0.vsix
   ```

The last R session that opened a plot device is the one displayed.
