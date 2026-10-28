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
