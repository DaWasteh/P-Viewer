import { StreamLanguage, type StreamParser, type StringStream } from "@codemirror/language";

// Lightweight stream tokenizers for formats that @codemirror/language-data does
// not cover. They only need to be good enough for readable highlighting; every
// unknown construct falls through to plain text.

interface SimpleState {
  inString: string | null;
  inComment: boolean;
}

function startSimpleState(): SimpleState {
  return { inString: null, inComment: false };
}

function readString(stream: StringStream, quote: string, allowEscape = true): boolean {
  while (!stream.eol()) {
    const character = stream.next();
    if (allowEscape && character === "\\") {
      stream.next();
      continue;
    }
    if (character === quote) return true;
  }
  return false;
}

const batchKeywords = new Set([
  "echo",
  "set",
  "setlocal",
  "endlocal",
  "if",
  "else",
  "not",
  "exist",
  "defined",
  "errorlevel",
  "equ",
  "neq",
  "lss",
  "leq",
  "gtr",
  "geq",
  "goto",
  "call",
  "for",
  "in",
  "do",
  "exit",
  "pause",
  "shift",
  "start",
  "cd",
  "chdir",
  "md",
  "mkdir",
  "rd",
  "rmdir",
  "del",
  "erase",
  "copy",
  "xcopy",
  "move",
  "ren",
  "rename",
  "type",
  "dir",
  "cls",
  "title",
  "color",
  "prompt",
  "pushd",
  "popd",
  "choice",
  "timeout",
  "find",
  "findstr",
  "sort",
  "more",
  "assoc",
  "ftype",
  "ver",
  "vol",
  "path",
  "attrib",
  "tasklist",
  "taskkill",
  "net",
  "reg",
  "sc",
  "wmic",
  "powershell",
  "cmd",
  "on",
  "off",
  "nul",
  "con",
]);

const batchParser: StreamParser<SimpleState> = {
  name: "batch",
  startState: startSimpleState,
  token(stream) {
    if (stream.sol()) {
      if (stream.match(/^\s*(?:@?rem\b|::).*$/i)) return "comment";
      if (stream.match(/^\s*:[A-Za-z_][\w-]*/)) return "labelName";
    }
    if (stream.eatSpace()) return null;
    if (stream.match(/^%~?[\w*]+%?/)) return "variableName";
    if (stream.match(/^![\w]+!/)) return "variableName";
    if (stream.match(/^%%?~?[A-Za-z]/)) return "variableName";
    if (stream.match(/^"(?:[^"\n])*"?/)) return "string";
    if (stream.match(/^[&|<>]+/)) return "operator";
    if (stream.match(/^@/)) return "keyword";
    if (stream.match(/^\d+/)) return "number";
    if (stream.match(/^\/[A-Za-z?]+/)) return "attributeName";
    if (stream.match(/^[A-Za-z_][\w.-]*/)) {
      const word = stream.current().toLowerCase();
      return batchKeywords.has(word) ? "keyword" : null;
    }
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: "REM" } },
};

const makefileParser: StreamParser<SimpleState> = {
  name: "makefile",
  startState: startSimpleState,
  token(stream) {
    if (stream.sol() && stream.match(/^#.*$/)) return "comment";
    if (stream.sol() && stream.match(/^\t/)) return null;
    if (stream.sol() && stream.match(/^(?:\.PHONY|\.SUFFIXES|\.DEFAULT|\.PRECIOUS|\.INTERMEDIATE|\.SECONDARY|\.DELETE_ON_ERROR|\.IGNORE|\.SILENT|\.EXPORT_ALL_VARIABLES|\.NOTPARALLEL|\.ONESHELL|\.POSIX)\b/)) {
      return "keyword";
    }
    if (stream.sol() && stream.match(/^(?:include|-include|sinclude|ifeq|ifneq|ifdef|ifndef|else|endif|define|endef|export|unexport|override|vpath)\b/)) {
      return "keyword";
    }
    if (stream.sol() && stream.match(/^[^\s:=#][^:=#]*(?=:(?!=))/)) return "className";
    if (stream.eatSpace()) return null;
    if (stream.match(/^#.*$/)) return "comment";
    if (stream.match(/^\$\([^)]*\)|^\$\{[^}]*\}|^\$[@<^*?%+|]/)) return "variableName";
    if (stream.match(/^(?::=|\?=|\+=|!=|::=|=)/)) return "operator";
    if (stream.match(/^"(?:[^"\\]|\\.)*"?|^'(?:[^'\\]|\\.)*'?/)) return "string";
    if (stream.match(/^@|^-(?=\S)/)) return "operator";
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: "#" } },
};

const graphqlKeywords = new Set([
  "query",
  "mutation",
  "subscription",
  "fragment",
  "on",
  "type",
  "interface",
  "union",
  "enum",
  "input",
  "scalar",
  "schema",
  "extend",
  "directive",
  "implements",
  "repeatable",
  "true",
  "false",
  "null",
]);

const graphqlParser: StreamParser<SimpleState> = {
  name: "graphql",
  startState: startSimpleState,
  token(stream, state) {
    if (state.inComment) {
      if (stream.match(/^[\s\S]*?"""/)) state.inComment = false;
      else stream.skipToEnd();
      return "docString";
    }
    if (stream.eatSpace()) return null;
    if (stream.match(/^#.*$/)) return "comment";
    if (stream.match(/^"""/)) {
      if (!stream.match(/^[\s\S]*?"""/)) state.inComment = true;
      return "docString";
    }
    if (stream.match(/^"/)) {
      readString(stream, '"');
      return "string";
    }
    if (stream.match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/)) return "number";
    if (stream.match(/^\$[A-Za-z_]\w*/)) return "variableName";
    if (stream.match(/^@[A-Za-z_]\w*/)) return "annotation";
    if (stream.match(/^[A-Za-z_]\w*/)) {
      const word = stream.current();
      if (graphqlKeywords.has(word)) return "keyword";
      if (/^[A-Z]/.test(word)) return "typeName";
      if (stream.match(/^\s*:/, false)) return "propertyName";
      return null;
    }
    if (stream.match(/^\.\.\./)) return "operator";
    if (stream.match(/^[!=:|&]/)) return "operator";
    if (stream.match(/^[{}()[\]]/)) return "bracket";
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: "#" } },
};

const elixirKeywords = new Set([
  "def",
  "defp",
  "defmodule",
  "defmacro",
  "defmacrop",
  "defstruct",
  "defprotocol",
  "defimpl",
  "defexception",
  "defdelegate",
  "defguard",
  "defguardp",
  "defoverridable",
  "do",
  "end",
  "fn",
  "if",
  "else",
  "unless",
  "case",
  "cond",
  "when",
  "with",
  "for",
  "receive",
  "after",
  "try",
  "catch",
  "rescue",
  "raise",
  "throw",
  "reraise",
  "import",
  "require",
  "alias",
  "use",
  "quote",
  "unquote",
  "unquote_splicing",
  "and",
  "or",
  "not",
  "in",
  "true",
  "false",
  "nil",
  "super",
  "__MODULE__",
  "__DIR__",
  "__ENV__",
  "__CALLER__",
]);

const elixirParser: StreamParser<SimpleState> = {
  name: "elixir",
  startState: startSimpleState,
  token(stream, state) {
    if (state.inString) {
      const quote = state.inString;
      while (!stream.eol()) {
        const character = stream.next();
        if (character === "\\") {
          stream.next();
          continue;
        }
        if (character === quote[0] && (quote.length === 1 || stream.match(quote.slice(1)))) {
          state.inString = null;
          return "string";
        }
      }
      return "string";
    }
    if (stream.eatSpace()) return null;
    if (stream.match(/^#.*$/)) return "comment";
    if (stream.match(/^@[a-z_]\w*/)) return "meta";
    if (stream.match(/^"""|^'''/)) {
      state.inString = stream.current();
      return "string";
    }
    if (stream.match(/^~[a-zA-Z]"""/)) {
      state.inString = '"""';
      return "string";
    }
    if (stream.match(/^~[a-zA-Z](?:\/(?:[^\/\\]|\\.)*\/|\|(?:[^|\\]|\\.)*\||"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^)\\]|\\.)*\)|\[(?:[^\]\\]|\\.)*\]|\{(?:[^}\\]|\\.)*\}|<(?:[^>\\]|\\.)*>)[a-zA-Z]*/)) {
      return "special(string)";
    }
    if (stream.match(/^"/)) {
      if (!readString(stream, '"')) state.inString = '"';
      return "string";
    }
    if (stream.match(/^'/)) {
      readString(stream, "'");
      return "string";
    }
    if (stream.match(/^:(?:"(?:[^"\\]|\\.)*"|[a-zA-Z_]\w*[?!]?|[+\-*\/<>=!&|^~@]+)/)) return "atom";
    if (stream.match(/^\?(?:\\.|.)/)) return "character";
    if (stream.match(/^0[xX][0-9a-fA-F_]+|^0[bB][01_]+|^0[oO][0-7_]+|^\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?/)) {
      return "number";
    }
    if (stream.match(/^[A-Z][\w.]*/)) return "typeName";
    if (stream.match(/^[a-z_]\w*[?!]?/)) {
      const word = stream.current();
      if (elixirKeywords.has(word)) return "keyword";
      if (stream.match(/^:(?!:)/, false)) return "atom";
      return stream.peek() === "(" ? "function(variableName)" : null;
    }
    if (stream.match(/^(?:\|>|->|<-|=>|<>|\+\+|--|\.\.|::|==|!=|===|!==|<=|>=|&&|\|\||\\\\|<<|>>|[+\-*\/=<>!&|^~%.])/)) {
      return "operator";
    }
    if (stream.match(/^[{}()[\]]/)) return "bracket";
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: "#" } },
};

const bibtexParser: StreamParser<SimpleState> = {
  name: "bibtex",
  startState: startSimpleState,
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^%.*$/)) return "comment";
    if (stream.match(/^@[A-Za-z]+/)) return "keyword";
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return "string";
    if (stream.match(/^\d+/)) return "number";
    if (stream.match(/^[A-Za-z_][\w:.-]*(?=\s*=)/)) return "propertyName";
    if (stream.match(/^[A-Za-z_][\w:./-]*(?=\s*,)/)) return "labelName";
    if (stream.match(/^[=#,]/)) return "operator";
    if (stream.match(/^[{}()]/)) return "bracket";
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: "%" } },
};

const ignoreParser: StreamParser<SimpleState> = {
  name: "ignore",
  startState: startSimpleState,
  token(stream) {
    if (stream.sol() && stream.match(/^\s*#.*$/)) return "comment";
    if (stream.sol() && stream.match(/^!/)) return "operator";
    if (stream.match(/^[*?]+|^\[[^\]]*\]/)) return "special(string)";
    if (stream.match(/^\//)) return "punctuation";
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: "#" } },
};

const csvParser: StreamParser<{ column: number }> = {
  name: "csv",
  startState: () => ({ column: 0 }),
  token(stream, state) {
    if (stream.sol()) state.column = 0;
    if (stream.match(/^"(?:[^"]|"")*"?/)) return state.column % 2 === 0 ? "string" : "special(string)";
    if (stream.match(/^[,;\t|]/)) {
      state.column += 1;
      return "punctuation";
    }
    if (stream.match(/^-?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?(?=[,;\t|]|$)/)) return "number";
    stream.match(/^[^,;\t|"]+/) || stream.next();
    return state.column % 2 === 0 ? null : "meta";
  },
};

const cache = new Map<string, StreamLanguage<unknown>>();

export const CUSTOM_LANGUAGE_IDS = ["batch", "makefile", "graphql", "elixir", "bibtex", "ignore", "csv"] as const;
export type CustomLanguageId = (typeof CUSTOM_LANGUAGE_IDS)[number];

const parsers: Record<CustomLanguageId, StreamParser<any>> = {
  batch: batchParser,
  makefile: makefileParser,
  graphql: graphqlParser,
  elixir: elixirParser,
  bibtex: bibtexParser,
  ignore: ignoreParser,
  csv: csvParser,
};

export function customLanguage(id: CustomLanguageId): StreamLanguage<unknown> {
  let language = cache.get(id);
  if (!language) {
    language = StreamLanguage.define(parsers[id]);
    cache.set(id, language);
  }
  return language;
}
