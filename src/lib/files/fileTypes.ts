import type { DocumentKind, FileTypeInfo } from "./types";

// Special file names without a meaningful extension. The display casing is
// preserved for the file type selector; matching is case-insensitive.
const SPECIAL_FILES: Array<[string, FileTypeInfo]> = [
  ["Dockerfile", { kind: "code", language: "dockerfile", label: "Dockerfile" }],
  ["Containerfile", { kind: "code", language: "dockerfile", label: "Containerfile" }],
  ["Makefile", { kind: "code", language: "makefile", label: "Makefile" }],
  ["GNUmakefile", { kind: "code", language: "makefile", label: "GNU Makefile" }],
  ["justfile", { kind: "code", language: "makefile", label: "Justfile" }],
  ["CMakeLists.txt", { kind: "code", language: "cmake", label: "CMake" }],
  ["Jenkinsfile", { kind: "code", language: "groovy", label: "Jenkinsfile" }],
  ["Rakefile", { kind: "code", language: "ruby", label: "Rakefile" }],
  ["Gemfile", { kind: "code", language: "ruby", label: "Gemfile" }],
  ["Vagrantfile", { kind: "code", language: "ruby", label: "Vagrantfile" }],
  ["Brewfile", { kind: "code", language: "ruby", label: "Brewfile" }],
  ["Guardfile", { kind: "code", language: "ruby", label: "Guardfile" }],
  ["Podfile", { kind: "code", language: "ruby", label: "Podfile" }],
  ["Fastfile", { kind: "code", language: "ruby", label: "Fastfile" }],
  ["Dangerfile", { kind: "code", language: "ruby", label: "Dangerfile" }],
  ["Capfile", { kind: "code", language: "ruby", label: "Capfile" }],
  ["Procfile", { kind: "code", language: "properties", label: "Procfile" }],
  ["Pipfile", { kind: "code", language: "toml", label: "Pipfile" }],
  ["Cargo.lock", { kind: "code", language: "toml", label: "Cargo Lock" }],
  ["poetry.lock", { kind: "code", language: "toml", label: "Poetry Lock" }],
  ["uv.lock", { kind: "code", language: "toml", label: "uv Lock" }],
  ["Pipfile.lock", { kind: "json", language: "json", label: "Pipfile Lock" }],
  ["composer.lock", { kind: "json", language: "json", label: "Composer Lock" }],
  ["flake.lock", { kind: "json", language: "json", label: "Nix Flake Lock" }],
  ["deno.lock", { kind: "json", language: "json", label: "Deno Lock" }],
  ["bun.lock", { kind: "json", language: "json", label: "Bun Lock" }],
  ["yarn.lock", { kind: "text", language: "plaintext", label: "Yarn Lock" }],
  ["Gemfile.lock", { kind: "text", language: "plaintext", label: "Gemfile Lock" }],
  ["go.mod", { kind: "code", language: "gomod", label: "Go Module" }],
  ["go.sum", { kind: "code", language: "gomod", label: "Go Checksums" }],
  ["go.work", { kind: "code", language: "gomod", label: "Go Workspace" }],
  ["BUILD", { kind: "code", language: "starlark", label: "Bazel BUILD" }],
  ["BUILD.bazel", { kind: "code", language: "starlark", label: "Bazel BUILD" }],
  ["WORKSPACE", { kind: "code", language: "starlark", label: "Bazel WORKSPACE" }],
  ["WORKSPACE.bazel", { kind: "code", language: "starlark", label: "Bazel WORKSPACE" }],
  ["MODULE.bazel", { kind: "code", language: "starlark", label: "Bazel MODULE" }],
  ["BUCK", { kind: "code", language: "starlark", label: "Buck" }],
  ["PKGBUILD", { kind: "code", language: "shell", label: "PKGBUILD" }],
  ["gradlew", { kind: "code", language: "shell", label: "Gradle Wrapper" }],
  ["mvnw", { kind: "code", language: "shell", label: "Maven Wrapper" }],
  ["nginx.conf", { kind: "code", language: "nginx", label: "nginx-Konfiguration" }],
  ["Caddyfile", { kind: "text", language: "plaintext", label: "Caddyfile" }],
  ["hosts", { kind: "text", language: "plaintext", label: "Hosts" }],
  ["fstab", { kind: "text", language: "plaintext", label: "fstab" }],
  ["crontab", { kind: "text", language: "plaintext", label: "Crontab" }],
  ["LICENSE", { kind: "text", language: "plaintext", label: "Lizenz" }],
  ["UNLICENSE", { kind: "text", language: "plaintext", label: "Unlicense" }],
  ["COPYING", { kind: "text", language: "plaintext", label: "Lizenz (COPYING)" }],
  ["NOTICE", { kind: "text", language: "plaintext", label: "Notice" }],
  ["README", { kind: "text", language: "plaintext", label: "README" }],
  ["CHANGELOG", { kind: "text", language: "plaintext", label: "Changelog" }],
  ["CHANGES", { kind: "text", language: "plaintext", label: "Changes" }],
  ["HISTORY", { kind: "text", language: "plaintext", label: "History" }],
  ["NEWS", { kind: "text", language: "plaintext", label: "News" }],
  ["AUTHORS", { kind: "text", language: "plaintext", label: "Autoren" }],
  ["CONTRIBUTORS", { kind: "text", language: "plaintext", label: "Mitwirkende" }],
  ["CODEOWNERS", { kind: "text", language: "plaintext", label: "Code Owners" }],
  ["INSTALL", { kind: "text", language: "plaintext", label: "Installationshinweise" }],
  ["TODO", { kind: "text", language: "plaintext", label: "TODO" }],
  ["THANKS", { kind: "text", language: "plaintext", label: "Danksagungen" }],
  ["VERSION", { kind: "text", language: "plaintext", label: "Version" }],
  [".env", { kind: "code", language: "properties", label: "Environment" }],
  [".envrc", { kind: "code", language: "shell", label: "direnv" }],
  [".gitignore", { kind: "code", language: "ignore", label: "Git Ignore" }],
  [".gitattributes", { kind: "code", language: "ignore", label: "Git Attributes" }],
  [".gitmodules", { kind: "code", language: "ini", label: "Git Modules" }],
  [".gitconfig", { kind: "code", language: "ini", label: "Git Config" }],
  [".mailmap", { kind: "text", language: "plaintext", label: "Git Mailmap" }],
  [".gitkeep", { kind: "text", language: "plaintext", label: "Git Keep" }],
  [".hgignore", { kind: "code", language: "ignore", label: "Mercurial Ignore" }],
  [".hgrc", { kind: "code", language: "ini", label: "Mercurial Config" }],
  [".editorconfig", { kind: "code", language: "ini", label: "EditorConfig" }],
  [".npmrc", { kind: "code", language: "ini", label: "npm Config" }],
  [".yarnrc", { kind: "code", language: "ini", label: "Yarn Config" }],
  [".htaccess", { kind: "code", language: "ini", label: "Apache htaccess" }],
  [".pylintrc", { kind: "code", language: "ini", label: "Pylint Config" }],
  [".flake8", { kind: "code", language: "ini", label: "Flake8 Config" }],
  [".coveragerc", { kind: "code", language: "ini", label: "Coverage Config" }],
  [".flowconfig", { kind: "code", language: "ini", label: "Flow Config" }],
  [".dockerignore", { kind: "code", language: "ignore", label: "Docker Ignore" }],
  [".npmignore", { kind: "code", language: "ignore", label: "npm Ignore" }],
  [".prettierignore", { kind: "code", language: "ignore", label: "Prettier Ignore" }],
  [".eslintignore", { kind: "code", language: "ignore", label: "ESLint Ignore" }],
  [".stylelintignore", { kind: "code", language: "ignore", label: "Stylelint Ignore" }],
  [".vscodeignore", { kind: "code", language: "ignore", label: "VS Code Ignore" }],
  [".gcloudignore", { kind: "code", language: "ignore", label: "gcloud Ignore" }],
  [".helmignore", { kind: "code", language: "ignore", label: "Helm Ignore" }],
  [".terraformignore", { kind: "code", language: "ignore", label: "Terraform Ignore" }],
  [".ignore", { kind: "code", language: "ignore", label: "Ignore-Datei" }],
  [".rgignore", { kind: "code", language: "ignore", label: "ripgrep Ignore" }],
  [".prettierrc", { kind: "json", language: "json", label: "Prettier Config" }],
  [".babelrc", { kind: "json", language: "json", label: "Babel Config" }],
  [".eslintrc", { kind: "json", language: "json", label: "ESLint Config" }],
  [".swcrc", { kind: "json", language: "json", label: "SWC Config" }],
  [".huskyrc", { kind: "json", language: "json", label: "Husky Config" }],
  [".lintstagedrc", { kind: "json", language: "json", label: "lint-staged Config" }],
  [".nycrc", { kind: "json", language: "json", label: "nyc Config" }],
  [".stylelintrc", { kind: "json", language: "json", label: "Stylelint Config" }],
  [".markdownlintrc", { kind: "json", language: "json", label: "markdownlint Config" }],
  [".mocharc", { kind: "json", language: "json", label: "Mocha Config" }],
  [".jshintrc", { kind: "json", language: "json", label: "JSHint Config" }],
  [".releaserc", { kind: "json", language: "json", label: "semantic-release Config" }],
  [".renovaterc", { kind: "json", language: "json", label: "Renovate Config" }],
  [".bowerrc", { kind: "json", language: "json", label: "Bower Config" }],
  [".clang-format", { kind: "code", language: "yaml", label: "clang-format" }],
  [".clang-tidy", { kind: "code", language: "yaml", label: "clang-tidy" }],
  [".yamllint", { kind: "code", language: "yaml", label: "yamllint" }],
  [".gemrc", { kind: "code", language: "yaml", label: "RubyGems Config" }],
  [".irbrc", { kind: "code", language: "ruby", label: "IRB Config" }],
  [".pryrc", { kind: "code", language: "ruby", label: "Pry Config" }],
  [".bashrc", { kind: "code", language: "shell", label: "Bash RC" }],
  [".bash_profile", { kind: "code", language: "shell", label: "Bash Profile" }],
  [".bash_aliases", { kind: "code", language: "shell", label: "Bash Aliases" }],
  [".bash_logout", { kind: "code", language: "shell", label: "Bash Logout" }],
  [".zshrc", { kind: "code", language: "shell", label: "Zsh RC" }],
  [".zshenv", { kind: "code", language: "shell", label: "Zsh Env" }],
  [".zprofile", { kind: "code", language: "shell", label: "Zsh Profile" }],
  [".zlogin", { kind: "code", language: "shell", label: "Zsh Login" }],
  [".profile", { kind: "code", language: "shell", label: "Shell Profile" }],
  [".xinitrc", { kind: "code", language: "shell", label: "X Init" }],
  [".vimrc", { kind: "code", language: "vim", label: "Vim RC" }],
  ["_vimrc", { kind: "code", language: "vim", label: "Vim RC (Windows)" }],
  [".gvimrc", { kind: "code", language: "vim", label: "GVim RC" }],
  [".ideavimrc", { kind: "code", language: "vim", label: "IdeaVim RC" }],
  ["vimrc", { kind: "code", language: "vim", label: "Vim RC" }],
  [".nvmrc", { kind: "text", language: "plaintext", label: "nvm Version" }],
  [".node-version", { kind: "text", language: "plaintext", label: "Node-Version" }],
  [".python-version", { kind: "text", language: "plaintext", label: "Python-Version" }],
  [".ruby-version", { kind: "text", language: "plaintext", label: "Ruby-Version" }],
  [".tool-versions", { kind: "text", language: "plaintext", label: "asdf Tool Versions" }],
  [".browserslistrc", { kind: "text", language: "plaintext", label: "Browserslist" }],
];

const TYPES: Record<string, FileTypeInfo> = {
  md: { kind: "markdown", language: "markdown", label: "Markdown" },
  markdown: { kind: "markdown", language: "markdown", label: "Markdown" },
  mdown: { kind: "markdown", language: "markdown", label: "Markdown" },
  mkd: { kind: "markdown", language: "markdown", label: "Markdown" },
  mkdn: { kind: "markdown", language: "markdown", label: "Markdown" },
  mdwn: { kind: "markdown", language: "markdown", label: "Markdown" },
  mdx: { kind: "markdown", language: "mdx", label: "MDX" },
  rmd: { kind: "markdown", language: "markdown", label: "R Markdown" },
  qmd: { kind: "markdown", language: "markdown", label: "Quarto" },

  json: { kind: "json", language: "json", label: "JSON" },
  jsonc: { kind: "json", language: "json", label: "JSON mit Kommentaren" },
  json5: { kind: "json", language: "json5", label: "JSON5" },
  jsonl: { kind: "json", language: "json", label: "JSON Lines" },
  ndjson: { kind: "json", language: "json", label: "NDJSON" },
  jsonld: { kind: "json", language: "json", label: "JSON-LD" },
  geojson: { kind: "json", language: "json", label: "GeoJSON" },
  topojson: { kind: "json", language: "json", label: "TopoJSON" },
  webmanifest: { kind: "json", language: "json", label: "Web App Manifest" },
  map: { kind: "json", language: "json", label: "Source Map" },
  har: { kind: "json", language: "json", label: "HTTP-Archiv" },
  avsc: { kind: "json", language: "json", label: "Avro-Schema" },
  arb: { kind: "json", language: "json", label: "Application Resource Bundle" },
  sarif: { kind: "json", language: "json", label: "SARIF-Analysebericht" },
  "code-workspace": { kind: "json", language: "json", label: "VS-Code-Arbeitsbereich" },
  "code-snippets": { kind: "json", language: "json", label: "VS-Code-Snippets" },
  ipynb: { kind: "notebook", language: "json", label: "Jupyter Notebook" },

  tex: { kind: "latex", language: "stex", label: "LaTeX" },
  latex: { kind: "latex", language: "stex", label: "LaTeX" },
  ltx: { kind: "latex", language: "stex", label: "LaTeX" },
  rnw: { kind: "latex", language: "stex", label: "R noweb (Sweave/knitr)" },
  sty: { kind: "code", language: "stex", label: "LaTeX Style" },
  cls: { kind: "code", language: "stex", label: "LaTeX Class" },
  dtx: { kind: "code", language: "stex", label: "LaTeX Quellpaket" },
  ins: { kind: "code", language: "stex", label: "LaTeX Installationsskript" },
  bib: { kind: "code", language: "bibtex", label: "BibTeX" },

  js: { kind: "code", language: "javascript", label: "JavaScript" },
  mjs: { kind: "code", language: "javascript", label: "JavaScript" },
  cjs: { kind: "code", language: "javascript", label: "JavaScript" },
  jsx: { kind: "code", language: "jsx", label: "JavaScript JSX" },
  ts: { kind: "code", language: "typescript", label: "TypeScript" },
  mts: { kind: "code", language: "typescript", label: "TypeScript" },
  cts: { kind: "code", language: "typescript", label: "TypeScript" },
  tsx: { kind: "code", language: "tsx", label: "TypeScript TSX" },
  coffee: { kind: "code", language: "coffeescript", label: "CoffeeScript" },
  py: { kind: "code", language: "python", label: "Python" },
  pyw: { kind: "code", language: "python", label: "Python" },
  pyi: { kind: "code", language: "python", label: "Python Stub" },
  pyx: { kind: "code", language: "cython", label: "Cython" },
  pxd: { kind: "code", language: "cython", label: "Cython Definition" },
  pxi: { kind: "code", language: "cython", label: "Cython Include" },
  bzl: { kind: "code", language: "starlark", label: "Starlark" },
  bazel: { kind: "code", language: "starlark", label: "Bazel" },
  rs: { kind: "code", language: "rust", label: "Rust" },
  go: { kind: "code", language: "go", label: "Go" },
  java: { kind: "code", language: "java", label: "Java" },
  kt: { kind: "code", language: "kotlin", label: "Kotlin" },
  kts: { kind: "code", language: "kotlin", label: "Kotlin Script" },
  groovy: { kind: "code", language: "groovy", label: "Groovy" },
  gradle: { kind: "code", language: "groovy", label: "Gradle" },
  scala: { kind: "code", language: "scala", label: "Scala" },
  sc: { kind: "code", language: "scala", label: "Scala Script" },
  sbt: { kind: "code", language: "scala", label: "sbt-Build" },
  cs: { kind: "code", language: "csharp", label: "C#" },
  csx: { kind: "code", language: "csharp", label: "C# Script" },
  fs: { kind: "code", language: "fsharp", label: "F#" },
  fsi: { kind: "code", language: "fsharp", label: "F# Signature" },
  fsx: { kind: "code", language: "fsharp", label: "F# Script" },
  vb: { kind: "code", language: "vbnet", label: "VB.NET" },
  vbs: { kind: "code", language: "vbscript", label: "VBScript" },
  c: { kind: "code", language: "c", label: "C" },
  h: { kind: "code", language: "c", label: "C Header" },
  cc: { kind: "code", language: "cpp", label: "C++" },
  cpp: { kind: "code", language: "cpp", label: "C++" },
  cxx: { kind: "code", language: "cpp", label: "C++" },
  hpp: { kind: "code", language: "cpp", label: "C++ Header" },
  hh: { kind: "code", language: "cpp", label: "C++ Header" },
  hxx: { kind: "code", language: "cpp", label: "C++ Header" },
  ipp: { kind: "code", language: "cpp", label: "C++ Implementierung" },
  tpp: { kind: "code", language: "cpp", label: "C++ Template" },
  inl: { kind: "code", language: "cpp", label: "C++ Inline" },
  ino: { kind: "code", language: "cpp", label: "Arduino" },
  cu: { kind: "code", language: "cuda", label: "CUDA" },
  cuh: { kind: "code", language: "cuda", label: "CUDA Header" },
  glsl: { kind: "code", language: "glsl", label: "GLSL-Shader" },
  vert: { kind: "code", language: "glsl", label: "Vertex-Shader" },
  frag: { kind: "code", language: "glsl", label: "Fragment-Shader" },
  hlsl: { kind: "code", language: "hlsl", label: "HLSL-Shader" },
  mm: { kind: "code", language: "objectivecpp", label: "Objective-C++" },
  swift: { kind: "code", language: "swift", label: "Swift" },
  rb: { kind: "code", language: "ruby", label: "Ruby" },
  rake: { kind: "code", language: "ruby", label: "Rake" },
  gemspec: { kind: "code", language: "ruby", label: "Gemspec" },
  ru: { kind: "code", language: "ruby", label: "Rack" },
  podspec: { kind: "code", language: "ruby", label: "CocoaPods Spec" },
  erb: { kind: "code", language: "erb", label: "Ruby ERB" },
  php: { kind: "code", language: "php", label: "PHP" },
  phtml: { kind: "code", language: "php", label: "PHP-Vorlage" },
  pl: { kind: "code", language: "perl", label: "Perl" },
  pm: { kind: "code", language: "perl", label: "Perl Module" },
  lua: { kind: "code", language: "lua", label: "Lua" },
  r: { kind: "code", language: "r", label: "R" },
  jl: { kind: "code", language: "julia", label: "Julia" },
  dart: { kind: "code", language: "dart", label: "Dart" },
  ex: { kind: "code", language: "elixir", label: "Elixir" },
  exs: { kind: "code", language: "elixir", label: "Elixir Script" },
  eex: { kind: "code", language: "eex", label: "Elixir EEx" },
  heex: { kind: "code", language: "eex", label: "Phoenix HEEx" },
  leex: { kind: "code", language: "eex", label: "Phoenix LEEx" },
  erl: { kind: "code", language: "erlang", label: "Erlang" },
  hrl: { kind: "code", language: "erlang", label: "Erlang Header" },
  hs: { kind: "code", language: "haskell", label: "Haskell" },
  cabal: { kind: "code", language: "cabal", label: "Cabal-Paket" },
  elm: { kind: "code", language: "elm", label: "Elm" },
  ml: { kind: "code", language: "ocaml", label: "OCaml" },
  mli: { kind: "code", language: "ocaml", label: "OCaml Interface" },
  mll: { kind: "code", language: "ocaml", label: "OCaml Lexer" },
  mly: { kind: "code", language: "ocaml", label: "OCaml Parser" },
  sml: { kind: "code", language: "sml", label: "Standard ML" },
  clj: { kind: "code", language: "clojure", label: "Clojure" },
  cljs: { kind: "code", language: "clojure", label: "ClojureScript" },
  cljc: { kind: "code", language: "clojure", label: "Clojure Common" },
  edn: { kind: "code", language: "clojure", label: "EDN" },
  lisp: { kind: "code", language: "lisp", label: "Lisp" },
  lsp: { kind: "code", language: "lisp", label: "Lisp" },
  cl: { kind: "code", language: "lisp", label: "Common Lisp" },
  el: { kind: "code", language: "lisp", label: "Emacs Lisp" },
  scm: { kind: "code", language: "scheme", label: "Scheme" },
  ss: { kind: "code", language: "scheme", label: "Scheme" },
  rkt: { kind: "code", language: "scheme", label: "Racket" },
  cr: { kind: "code", language: "crystal", label: "Crystal" },
  d: { kind: "code", language: "d", label: "D" },
  pas: { kind: "code", language: "pascal", label: "Pascal" },
  dpr: { kind: "code", language: "pascal", label: "Delphi-Projekt" },
  lpr: { kind: "code", language: "pascal", label: "Lazarus-Projekt" },
  f90: { kind: "code", language: "fortran", label: "Fortran" },
  f95: { kind: "code", language: "fortran", label: "Fortran" },
  f03: { kind: "code", language: "fortran", label: "Fortran" },
  f08: { kind: "code", language: "fortran", label: "Fortran" },
  f: { kind: "code", language: "fortran", label: "Fortran" },
  for: { kind: "code", language: "fortran", label: "Fortran" },
  f77: { kind: "code", language: "fortran", label: "Fortran 77" },
  ftn: { kind: "code", language: "fortran", label: "Fortran" },
  cob: { kind: "code", language: "cobol", label: "COBOL" },
  cbl: { kind: "code", language: "cobol", label: "COBOL" },
  cpy: { kind: "code", language: "cobol", label: "COBOL Copybook" },
  hx: { kind: "code", language: "haxe", label: "Haxe" },
  tcl: { kind: "code", language: "tcl", label: "Tcl" },
  tk: { kind: "code", language: "tcl", label: "Tcl/Tk" },
  asm: { kind: "code", language: "assembler", label: "Assembler" },
  s: { kind: "code", language: "assembler", label: "Assembler" },
  vhd: { kind: "code", language: "vhdl", label: "VHDL" },
  vhdl: { kind: "code", language: "vhdl", label: "VHDL" },
  v: { kind: "code", language: "verilog", label: "Verilog" },
  sv: { kind: "code", language: "systemverilog", label: "SystemVerilog" },
  svh: { kind: "code", language: "systemverilog", label: "SystemVerilog Header" },
  wat: { kind: "code", language: "wasm", label: "WebAssembly Text" },
  wast: { kind: "code", language: "wasm", label: "WebAssembly Text" },
  proto: { kind: "code", language: "protobuf", label: "Protocol Buffers" },
  feature: { kind: "code", language: "gherkin", label: "Gherkin" },
  cypher: { kind: "code", language: "cypher", label: "Cypher" },
  sparql: { kind: "code", language: "sparql", label: "SPARQL" },
  rq: { kind: "code", language: "sparql", label: "SPARQL" },
  ttl: { kind: "code", language: "turtle", label: "Turtle (RDF)" },
  nt: { kind: "code", language: "ntriples", label: "N-Triples" },
  xq: { kind: "code", language: "xquery", label: "XQuery" },
  xquery: { kind: "code", language: "xquery", label: "XQuery" },

  sh: { kind: "code", language: "shell", label: "Shell" },
  bash: { kind: "code", language: "shell", label: "Bash" },
  zsh: { kind: "code", language: "shell", label: "Zsh" },
  fish: { kind: "code", language: "shell", label: "Fish" },
  ksh: { kind: "code", language: "shell", label: "Korn Shell" },
  csh: { kind: "code", language: "shell", label: "C Shell" },
  tcsh: { kind: "code", language: "shell", label: "TENEX C Shell" },
  bat: { kind: "code", language: "batch", label: "Windows Batch" },
  cmd: { kind: "code", language: "batch", label: "Windows Command" },
  ps1: { kind: "code", language: "powershell", label: "PowerShell" },
  psm1: { kind: "code", language: "powershell", label: "PowerShell Module" },
  psd1: { kind: "code", language: "powershell", label: "PowerShell Data" },
  dockerfile: { kind: "code", language: "dockerfile", label: "Dockerfile" },
  mk: { kind: "code", language: "makefile", label: "Makefile" },
  make: { kind: "code", language: "makefile", label: "Makefile" },
  mak: { kind: "code", language: "makefile", label: "Makefile" },
  cmake: { kind: "code", language: "cmake", label: "CMake" },
  nsi: { kind: "code", language: "nsis", label: "NSIS" },
  nsh: { kind: "code", language: "nsis", label: "NSIS Header" },
  diff: { kind: "code", language: "diff", label: "Diff" },
  patch: { kind: "code", language: "diff", label: "Patch" },
  http: { kind: "code", language: "http", label: "HTTP-Anfrage" },
  rest: { kind: "code", language: "http", label: "REST-Anfrage" },
  tf: { kind: "code", language: "hcl", label: "Terraform" },
  tfvars: { kind: "code", language: "hcl", label: "Terraform-Variablen" },
  hcl: { kind: "code", language: "hcl", label: "HCL" },
  nix: { kind: "code", language: "nix", label: "Nix" },
  vim: { kind: "code", language: "vim", label: "Vim Script" },

  html: { kind: "html", language: "html", label: "HTML" },
  htm: { kind: "html", language: "html", label: "HTML" },
  xhtml: { kind: "html", language: "html", label: "XHTML" },
  astro: { kind: "code", language: "astro", label: "Astro" },
  vue: { kind: "code", language: "vue", label: "Vue" },
  svelte: { kind: "code", language: "svelte", label: "Svelte" },
  hbs: { kind: "code", language: "handlebars", label: "Handlebars" },
  handlebars: { kind: "code", language: "handlebars", label: "Handlebars" },
  pug: { kind: "code", language: "pug", label: "Pug" },
  jade: { kind: "code", language: "pug", label: "Jade" },
  j2: { kind: "code", language: "jinja", label: "Jinja" },
  jinja: { kind: "code", language: "jinja", label: "Jinja" },
  jinja2: { kind: "code", language: "jinja", label: "Jinja" },
  liquid: { kind: "code", language: "liquid", label: "Liquid" },
  css: { kind: "code", language: "css", label: "CSS" },
  scss: { kind: "code", language: "sass", label: "SCSS" },
  sass: { kind: "code", language: "sass", label: "Sass" },
  less: { kind: "code", language: "less", label: "Less" },
  styl: { kind: "code", language: "stylus", label: "Stylus" },
  xml: { kind: "code", language: "xml", label: "XML" },
  xsl: { kind: "code", language: "xml", label: "XSLT" },
  xslt: { kind: "code", language: "xml", label: "XSLT" },
  xsd: { kind: "code", language: "xml", label: "XML Schema" },
  dtd: { kind: "code", language: "dtd", label: "DTD" },
  wsdl: { kind: "code", language: "xml", label: "WSDL" },
  rdf: { kind: "code", language: "xml", label: "RDF/XML" },
  plist: { kind: "code", language: "xml", label: "Property List" },
  mobileconfig: { kind: "code", language: "xml", label: "Apple-Konfigurationsprofil" },
  entitlements: { kind: "code", language: "xml", label: "Apple Entitlements" },
  xcscheme: { kind: "code", language: "xml", label: "Xcode-Schema" },
  xaml: { kind: "code", language: "xml", label: "XAML" },
  axaml: { kind: "code", language: "xml", label: "Avalonia XAML" },
  fxml: { kind: "code", language: "xml", label: "JavaFX FXML" },
  wxml: { kind: "code", language: "xml", label: "WeChat WXML" },
  csproj: { kind: "code", language: "xml", label: "C#-Projekt" },
  vbproj: { kind: "code", language: "xml", label: "VB-Projekt" },
  fsproj: { kind: "code", language: "xml", label: "F#-Projekt" },
  props: { kind: "code", language: "xml", label: "MSBuild-Eigenschaften" },
  targets: { kind: "code", language: "xml", label: "MSBuild-Ziele" },
  nuspec: { kind: "code", language: "xml", label: "NuGet-Spezifikation" },
  resx: { kind: "code", language: "xml", label: ".NET-Ressourcen" },
  ui: { kind: "code", language: "xml", label: "Qt Designer" },
  qrc: { kind: "code", language: "xml", label: "Qt-Ressourcen" },
  opml: { kind: "code", language: "xml", label: "OPML-Gliederung" },
  gpx: { kind: "code", language: "xml", label: "GPX-Track" },
  kml: { kind: "code", language: "xml", label: "KML-Karte" },
  xlf: { kind: "code", language: "xml", label: "XLIFF-Übersetzung" },
  xliff: { kind: "code", language: "xml", label: "XLIFF-Übersetzung" },
  rss: { kind: "code", language: "xml", label: "RSS-Feed" },
  atom: { kind: "code", language: "xml", label: "Atom-Feed" },
  svg: { kind: "svg", language: "xml", label: "SVG" },

  yaml: { kind: "code", language: "yaml", label: "YAML" },
  yml: { kind: "code", language: "yaml", label: "YAML" },
  cff: { kind: "code", language: "yaml", label: "Citation File Format" },
  toml: { kind: "code", language: "toml", label: "TOML" },
  ini: { kind: "code", language: "ini", label: "INI" },
  cfg: { kind: "code", language: "ini", label: "Konfiguration" },
  conf: { kind: "code", language: "ini", label: "Konfiguration" },
  cnf: { kind: "code", language: "ini", label: "Konfiguration" },
  inf: { kind: "code", language: "ini", label: "Windows-Setup-Information" },
  desktop: { kind: "code", language: "ini", label: "Desktop-Eintrag" },
  service: { kind: "code", language: "ini", label: "systemd-Dienst" },
  timer: { kind: "code", language: "ini", label: "systemd-Timer" },
  socket: { kind: "code", language: "ini", label: "systemd-Socket" },
  reg: { kind: "code", language: "ini", label: "Windows-Registrierung" },
  env: { kind: "code", language: "properties", label: "Environment" },
  properties: { kind: "code", language: "properties", label: "Properties" },
  xcconfig: { kind: "code", language: "properties", label: "Xcode-Konfiguration" },
  sql: { kind: "code", language: "sql", label: "SQL" },
  pgsql: { kind: "code", language: "sql", label: "PostgreSQL" },
  mysql: { kind: "code", language: "sql", label: "MySQL" },
  plsql: { kind: "code", language: "sql", label: "PL/SQL" },
  hql: { kind: "code", language: "sql", label: "Hive QL" },
  cql: { kind: "code", language: "sql", label: "Cassandra QL" },
  graphql: { kind: "code", language: "graphql", label: "GraphQL" },
  gql: { kind: "code", language: "graphql", label: "GraphQL" },

  txt: { kind: "text", language: "plaintext", label: "Text" },
  text: { kind: "text", language: "plaintext", label: "Text" },
  log: { kind: "text", language: "plaintext", label: "Log" },
  rst: { kind: "text", language: "plaintext", label: "reStructuredText" },
  adoc: { kind: "text", language: "plaintext", label: "AsciiDoc" },
  asciidoc: { kind: "text", language: "plaintext", label: "AsciiDoc" },
  org: { kind: "text", language: "plaintext", label: "Org" },
  pod: { kind: "text", language: "plaintext", label: "Perl POD" },
  wiki: { kind: "text", language: "plaintext", label: "Wikitext" },
  textile: { kind: "code", language: "textile", label: "Textile" },
  srt: { kind: "text", language: "plaintext", label: "SubRip-Untertitel" },
  vtt: { kind: "text", language: "plaintext", label: "WebVTT-Untertitel" },
  ass: { kind: "text", language: "plaintext", label: "Advanced-SubStation-Untertitel" },
  ssa: { kind: "text", language: "plaintext", label: "SubStation-Alpha-Untertitel" },
  sln: { kind: "text", language: "plaintext", label: "Visual-Studio-Projektmappe" },
  pem: { kind: "text", language: "plaintext", label: "PEM-Zertifikat/-Schlüssel" },
  crt: { kind: "text", language: "plaintext", label: "Zertifikat" },
  csr: { kind: "text", language: "plaintext", label: "Zertifikatsanforderung" },
  pub: { kind: "text", language: "plaintext", label: "Öffentlicher Schlüssel" },
  asc: { kind: "text", language: "plaintext", label: "ASCII-Armor (PGP)" },
  sha256: { kind: "text", language: "plaintext", label: "SHA-256-Prüfsumme" },
  md5: { kind: "text", language: "plaintext", label: "MD5-Prüfsumme" },
  csv: { kind: "csv", language: "csv", label: "CSV" },
  tsv: { kind: "csv", language: "csv", label: "TSV" },
  tab: { kind: "csv", language: "csv", label: "Tabulatorgetrennte Werte" },

  png: { kind: "image", language: "binary", label: "PNG-Bild" },
  apng: { kind: "image", language: "binary", label: "Animiertes PNG" },
  jpg: { kind: "image", language: "binary", label: "JPEG-Bild" },
  jpeg: { kind: "image", language: "binary", label: "JPEG-Bild" },
  jfif: { kind: "image", language: "binary", label: "JPEG-Bild (JFIF)" },
  gif: { kind: "image", language: "binary", label: "GIF-Bild" },
  webp: { kind: "image", language: "binary", label: "WebP-Bild" },
  bmp: { kind: "image", language: "binary", label: "Bitmap-Bild" },
  ico: { kind: "image", language: "binary", label: "Windows-Symbol" },
  avif: { kind: "image", language: "binary", label: "AVIF-Bild" },
  pdf: { kind: "pdf", language: "binary", label: "PDF-Dokument" },
};

const SPECIAL_NAMES: Record<string, FileTypeInfo> = Object.fromEntries(
  SPECIAL_FILES.map(([name, fileType]) => [name.toLowerCase(), fileType]),
);

const SPECIAL_NAME_CASE: Record<string, string> = Object.fromEntries(
  SPECIAL_FILES.map(([name]) => [name.toLowerCase(), name]),
);

/** Kinds delivered as read-only binary payloads instead of editable text. */
export const BINARY_KINDS: ReadonlySet<DocumentKind> = new Set<DocumentKind>(["image", "pdf"]);

export function isBinaryKind(kind: DocumentKind): boolean {
  return BINARY_KINDS.has(kind);
}

export type FileTypeChoiceGroup =
  | "Text"
  | "Dokumente"
  | "Code und Konfiguration"
  | "Spezielle Dateinamen";

export interface FileTypeChoice {
  id: string;
  group: FileTypeChoiceGroup;
  label: string;
  fileType: FileTypeInfo;
  extension?: string;
  fileName?: string;
}

function groupFor(fileType: FileTypeInfo): FileTypeChoiceGroup {
  if (fileType.kind === "text") return "Text";
  if (fileType.kind === "code") return "Code und Konfiguration";
  return "Dokumente";
}

export const SUPPORTED_FILE_EXTENSIONS = Object.freeze(Object.keys(TYPES));

/** Extensions that are read and edited as text (everything except images and PDF). */
export const SUPPORTED_TEXT_EXTENSIONS = Object.freeze(
  Object.entries(TYPES)
    .filter(([, fileType]) => !isBinaryKind(fileType.kind))
    .map(([extension]) => extension),
);

export const SUPPORTED_BINARY_EXTENSIONS = Object.freeze(
  Object.entries(TYPES)
    .filter(([, fileType]) => isBinaryKind(fileType.kind))
    .map(([extension]) => extension),
);

// Binary kinds are not offered as a target type: a text document cannot become
// an image by renaming it.
export const SUPPORTED_FILE_TYPE_CHOICES: readonly FileTypeChoice[] = Object.freeze(
  [
    ...Object.entries(TYPES)
      .filter(([, fileType]) => !isBinaryKind(fileType.kind))
      .map(([extension, fileType]) => ({
        id: `extension:${extension}`,
        group: groupFor(fileType),
        label: `${fileType.label} (.${extension})`,
        fileType,
        extension,
      })),
    ...Object.entries(SPECIAL_NAMES).map(([name, fileType]) => ({
      id: `name:${name}`,
      group: "Spezielle Dateinamen" as const,
      label: `${fileType.label} (${SPECIAL_NAME_CASE[name]})`,
      fileType,
      fileName: SPECIAL_NAME_CASE[name],
    })),
  ].sort((left, right) =>
    left.label.localeCompare(right.label, "de", { sensitivity: "base" }),
  ),
);

const FALLBACK: FileTypeInfo = {
  kind: "text",
  language: "plaintext",
  label: "Text",
};

export function fileNameFromPath(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

export function extensionOf(fileName: string): string {
  const baseName = fileNameFromPath(fileName);
  const dot = baseName.lastIndexOf(".");
  return dot > 0 ? baseName.slice(dot + 1).toLowerCase() : "";
}

export function normalizeCustomExtension(value: string): string | null {
  const normalized = value.trim().replace(/^\.+/, "").toLowerCase();
  return /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,31}$/u.test(normalized)
    ? normalized
    : null;
}

export function fileNameWithExtension(fileName: string, extension: string): string {
  const normalized = normalizeCustomExtension(extension);
  if (!normalized) throw new Error("Ungültige Dateiendung.");

  const baseName = fileNameFromPath(fileName);
  const dot = baseName.lastIndexOf(".");
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
  return `${stem || "Unbenannt"}.${normalized}`;
}

function specialNameKey(baseName: string): string | null {
  if (SPECIAL_NAMES[baseName]) return baseName;
  // `.env.local`, `.env.production` and similar variants behave like `.env`;
  // `Dockerfile.dev` or `Dockerfile.prod` behave like `Dockerfile`.
  if (baseName.startsWith(".env.")) return ".env";
  if (baseName.startsWith("dockerfile.")) return "dockerfile";
  return null;
}

/** File type for a special file name (`Makefile`, `.gitignore`, …) or null. */
export function specialFileType(fileName: string): FileTypeInfo | null {
  const special = specialNameKey(fileNameFromPath(fileName).toLowerCase());
  return special ? SPECIAL_NAMES[special] : null;
}

export function fileTypeChoiceIdFor(fileName: string): string {
  const baseName = fileNameFromPath(fileName).toLowerCase();
  const special = specialNameKey(baseName);
  if (special) return `name:${special}`;

  const extension = extensionOf(baseName);
  return TYPES[extension] ? `extension:${extension}` : `custom:${extension}`;
}

export function fileNameForFileTypeChoice(
  fileName: string,
  choice: FileTypeChoice,
): string {
  return choice.fileName ?? fileNameWithExtension(fileName, choice.extension ?? "");
}

export function detectFileType(fileName: string): FileTypeInfo {
  const baseName = fileNameFromPath(fileName).toLowerCase();
  const special = specialNameKey(baseName);
  if (special) return SPECIAL_NAMES[special];
  return TYPES[extensionOf(baseName)] ?? FALLBACK;
}

export function countLines(content: string): number {
  return content.length === 0 ? 1 : content.split(/\r\n|\r|\n/).length;
}

export function countWords(content: string): number {
  const matches = content.trim().match(/[\p{L}\p{N}_'-]+/gu);
  return matches?.length ?? 0;
}
