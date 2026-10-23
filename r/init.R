# krplot R side: sends R plots (httpgd device) and HTML widgets (leaflet,
# plotly, DT, ...) to the R Plots view of VS Code. Sourced from ~/.Rprofile
# in VS Code terminals. Installed by the krplot extension in
# ~/.krplot/init.R: do not edit, it is overwritten on each update.
local({
  home <- Sys.getenv(
    if (.Platform$OS.type == "windows") "USERPROFILE" else "HOME"
  )
  dir <- file.path(home, ".krplot")
  events <- file.path(dir, "viewer")
  alive <- file.path(dir, "alive")
  dir.create(events, recursive = TRUE, showWarnings = FALSE)

  # The extension touches this file every few seconds while it runs
  extension_running <- function() {
    age <- difftime(Sys.time(), file.mtime(alive), units = "secs")
    isTRUE(age < 10)
  }

  # Plots: httpgd device; its URL and size are published for the view,
  # which keeps the device ratio by default
  device <- function(...) {
    httpgd::hgd(silent = TRUE)
    writeLines(
      c(
        httpgd::hgd_url(),
        getOption("httpgd.width", 720),
        getOption("httpgd.height", 576)
      ),
      file.path(dir, "url")
    )
  }

  # HTML widgets and pages: one event file per call, consumed by the
  # extension; the browser is used when the extension does not run
  viewer <- function(url, height = NULL) {
    if (!extension_running()) {
      return(utils::browseURL(url))
    }
    url <- sub("^file://", "", url)
    if (file.exists(url)) {
      url <- normalizePath(url, "/")
    }
    stamp <- format(Sys.time(), "%Y%m%d-%H%M%OS6")
    tmp <- tempfile(tmpdir = events, fileext = ".tmp")
    writeLines(url, tmp)
    # Atomic for the extension: it only reads *.txt files
    file.rename(
      tmp, file.path(events, sprintf("%s-%d.txt", stamp, Sys.getpid()))
    )
    invisible(url)
  }

  install <- function() {
    if (requireNamespace("httpgd", quietly = TRUE)) {
      options(device = device)
    }
    options(viewer = viewer, page_viewer = viewer)
  }
  install()

  # vscode-R (sess) installs its own viewer after ~/.Rprofile: take it
  # back in .First (run once R is started, then removed) and after any
  # top-level call that changes it again
  env <- globalenv()
  user_first <- if (exists(".First", env, inherits = FALSE)) {
    get(".First", env)
  }
  assign(".First", function() {
    rm(".First", envir = env)
    if (is.function(user_first)) {
      assign(".First", user_first, envir = env)
      user_first()
    }
    install()
  }, envir = env)
  addTaskCallback(function(...) {
    if (!identical(getOption("viewer"), viewer)) install()
    TRUE
  }, name = "krplot")
  invisible()
})
