# R Plots panel

VS Code extension adding a dedicated **R Plots** view, like the Plots pane
of RStudio or Positron. It shows the httpgd viewer of the current R session
(interactive: history, zoom, export) outside the editor area.

The view opens in the bottom panel; drag its tab to the secondary sidebar
to keep it on the side. VS Code remembers the position.

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
       dir <- file.path(home, ".rplot-panel")
       dir.create(dir, showWarnings = FALSE)
       writeLines(httpgd::hgd_url(), file.path(dir, "url"))
     })
   }
   ```

3. Build and install:

   ```sh
   npx @vscode/vsce package --allow-missing-repository
   code --install-extension rplot-panel-0.1.0.vsix
   ```

The last R session that opened a plot device is the one displayed.
