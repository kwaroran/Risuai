// RisuAI CBS (Character Book Script) Mode for CodeMirror 5
// https://github.com/kwaroran/RisuAI
//
// CBS Syntax: {{operation::arg1::arg2::...}}
// Block Syntax: {{#block ...}}...{{/}}
// Else Syntax: {{:else}}
// Comment Syntax: {{//::...}} or {{comment::...}}
//
// Licensed under MIT

(function(mod) {
  if (typeof exports === "object" && typeof module === "object") // CommonJS
    mod(require("../../lib/codemirror"));
  else if (typeof define === "function" && define.amd) // AMD
    define(["../../lib/codemirror"], mod);
  else // Plain browser env
    mod(CodeMirror);
})(function(CodeMirror) {
  "use strict";

  CodeMirror.defineMode("risuai-cbs", function(config, parserConfig) {

    // ─── Keyword Categories ────────────────────────────────────────────

    // Block-opening keywords (used with #)
    var blockKeywords = [
      "if", "if_pure", "when", "each", "func",
      "pure", "puredisplay", "escape"
    ];

    // Block operators (used inside #when)
    var blockOperators = [
      "is", "isnot", "and", "or", "not",
      "var", "toggle", "vis", "visnot", "tis", "tisnot",
      "keep", "legacy"
    ];

    // Comparison operators (inside #when)
    var comparisonOperators = [">", ">=", "<", "<="];

    // Character & identity
    var charKeywords = [
      "char", "bot", "user",
      "personality", "charpersona",
      "description", "chardesc",
      "scenario",
      "exampledialogue", "examplemessage"
    ];

    // Chat history & messages
    var chatKeywords = [
      "previouscharchat", "lastcharmessage",
      "previoususerchat", "lastusermessage",
      "charhistory", "charmessages",
      "userhistory", "usermessages",
      "history", "lastmessage", "lastmessageid",
      "previouschatlog"
    ];

    // Variable operations
    var varKeywords = [
      "getvar", "setvar", "addvar", "setdefaultvar",
      "getglobalvar", "setglobalvar",
      "tempvar", "gettempvar", "settempvar"
    ];

    // String manipulation
    var stringKeywords = [
      "startswith", "endswith", "contains",
      "replace", "split", "join", "spread",
      "trim", "length",
      "lower", "upper", "capitalize", "reverse"
    ];

    // Numeric functions
    var numericKeywords = [
      "round", "floor", "ceil", "abs",
      "remaind", "pow", "tonumber", "fixnum",
      "calc", "?"
    ];

    // Array / object functions
    var arrayKeywords = [
      "arraylength", "arrayelement",
      "arrayshift", "arraypop", "arraypush", "arraysplice",
      "arrayassert", "makearray",
      "dictelement", "objectassert",
      "element", "makedict", "filter"
    ];

    // Comparison & logic
    var logicKeywords = [
      "equal", "notequal",
      "greater", "less", "greaterequal", "lessequal",
      "and", "or", "not", "all", "any"
    ];

    // Date & time
    var dateKeywords = [
      "time", "isotime", "isodate", "date",
      "messagetime", "messagedate",
      "unixtime", "messageunixtimearray",
      "messageidleduration", "idleduration"
    ];

    // Random & probability
    var randomKeywords = [
      "random", "pick", "randint",
      "roll", "rollp", "dice", "hash"
    ];

    // Asset & display
    var assetKeywords = [
      "asset", "emotion", "image", "img",
      "video", "video-img", "audio",
      "bg", "bgm",
      "inlay", "inlayed", "inlayeddata",
      "path", "source", "raw"
    ];

    // Prompt functions
    var promptKeywords = [
      "persona", "userpersona",
      "mainprompt", "systemprompt", "main_prompt",
      "jb", "jailbreak",
      "globalnote", "systemnote", "ujb"
    ];

    // Metadata
    var metadataKeywords = [
      "metadata"
    ];

    // Chat state & status
    var stateKeywords = [
      "chatindex", "chat_index",
      "firstmsgindex", "first_msg_index",
      "isfirstmsg", "isfirstmessage",
      "role", "model", "axmodel", "maxcontext",
      "jbtoggled",
      "trigger_id", "triggerid",
      "lorebook", "worldinfo",
      "emotionlist", "assetlist", "chardisplayasset",
      "moduleenabled", "module_enabled",
      "moduleassetlist", "module_assetlist",
      "screenwidth", "screen_width",
      "screenheight", "screen_height",
      "iserror", "prefillsupported", "prefill_supported", "prefill"
    ];

    // Encoding & crypto
    var cryptoKeywords = [
      "xor", "xordecrypt", "xord",
      "crypt", "crypto", "caesar",
      "tohex", "fromhex",
      "unicodeencode", "unicodedecode", "u", "ue"
    ];

    // Aggregate
    var aggregateKeywords = [
      "min", "max", "sum", "average"
    ];

    // Special / utility
    var specialKeywords = [
      "blank", "none", "return",
      "button", "risu",
      "file", "comment", "//",
      "__", "hiddenkey",
      "tex", "ruby", "codeblock",
      "bkspc", "erase", "declare",
      "slot"
    ];

    // Escape characters
    var escapeKeywords = [
      "bo", "bc", "decbo", "decbc",
      "br", "cbr",
      "(", ")", "<", ">", ":", ";"
    ];

    // Build lookup sets for fast matching
    function makeSet(arr) {
      var set = {};
      for (var i = 0; i < arr.length; i++) set[arr[i]] = true;
      return set;
    }

    var blockKeywordSet = makeSet(blockKeywords);
    var blockOperatorSet = makeSet(blockOperators);

    // All CBS function keywords combined (for quick lookup)
    var allFunctions = [].concat(
      charKeywords, chatKeywords, varKeywords,
      stringKeywords, numericKeywords, arrayKeywords,
      logicKeywords, dateKeywords, randomKeywords,
      assetKeywords, promptKeywords, metadataKeywords,
      stateKeywords, cryptoKeywords, aggregateKeywords,
      specialKeywords, escapeKeywords
    );
    var functionSet = makeSet(allFunctions);

    // Variable-mutating functions (highlighted differently)
    var mutatingSet = makeSet([
      "setvar", "addvar", "setdefaultvar",
      "setglobalvar", "settempvar",
      "declare"
    ]);

    // Asset/display functions (highlighted differently)
    var assetSet = makeSet(assetKeywords);

    // ─── Tokenizer ─────────────────────────────────────────────────────

    function tokenBase(stream, state) {
      // Inside a CBS expression {{ ... }}
      if (state.inCbs) {
        return tokenCbs(stream, state);
      }

      // Check for CBS opening: {{
      if (stream.match("{{")) {
        state.inCbs = true;
        state.cbsDepth++;
        state.cbsTokenIndex = 0;
        state.cbsIsBlock = false;
        state.cbsIsClose = false;
        state.cbsIsElse = false;
        state.cbsIsComment = false;
        state.cbsFuncName = null;
        return "bracket cbs-bracket-open";
      }

      // Plain text - advance until we find {{ or end of line
      while (stream.next() != null) {
        if (stream.match("{{", false)) break;
      }
      return "cbs-plaintext";
    }

    function tokenCbs(stream, state) {
      // Check for closing }}
      if (stream.match("}}")) {
        state.inCbs = false;
        if (state.cbsDepth > 0) state.cbsDepth--;

        // Determine bracket style based on block type
        if (state.cbsIsBlock) {
          state.blockDepth++;
          return "bracket cbs-bracket-close cbs-block-open";
        } else if (state.cbsIsClose) {
          if (state.blockDepth > 0) state.blockDepth--;
          return "bracket cbs-bracket-close cbs-block-close";
        } else if (state.cbsIsElse) {
          return "bracket cbs-bracket-close cbs-else";
        } else if (state.cbsIsComment) {
          return "bracket cbs-bracket-close cbs-comment-close";
        }
        return "bracket cbs-bracket-close";
      }

      // Separator ::
      if (stream.match("::")) {
        state.cbsTokenIndex++;
        return "punctuation cbs-separator";
      }

      // First token after {{ — this is the function/block name
      if (state.cbsTokenIndex === 0) {
        return tokenCbsName(stream, state);
      }

      // Subsequent tokens are arguments
      return tokenCbsArg(stream, state);
    }

    function tokenCbsName(stream, state) {
      // Block close: {{/}}
      if (stream.match("/")) {
        state.cbsIsClose = true;
        return "keyword cbs-block-close-tag";
      }

      // Else: {{:else}}
      if (stream.match(":else")) {
        state.cbsIsElse = true;
        return "keyword cbs-else-keyword";
      }

      // Block open: {{#keyword ...}}
      if (stream.match("#")) {
        // Read the block keyword
        var word = "";
        while (!stream.eol()) {
          var ch = stream.peek();
          if (ch === ":" || ch === "}" || ch === " " || ch === "\t") break;
          word += stream.next();
        }

        var lower = word.toLowerCase();
        state.cbsFuncName = "#" + lower;

        if (blockKeywordSet[lower]) {
          state.cbsIsBlock = true;

          // For #when, #each, #func — the remainder before :: or }} is part of the expression
          if (lower === "when" || lower === "each" || lower === "func" ||
              lower === "if" || lower === "if_pure") {
            // Consume any trailing spaces that are part of the keyword token
            // but leave the condition/expression for the next token
            return "keyword cbs-block-keyword";
          }
          return "keyword cbs-block-keyword";
        }

        // Unknown block
        state.cbsIsBlock = true;
        return "keyword cbs-block-keyword cbs-unknown";
      }

      // Comment: {{//::...}} or {{comment::...}}
      if (stream.match("//")) {
        state.cbsIsComment = true;
        state.cbsFuncName = "//";
        return "comment cbs-comment-keyword";
      }

      // Regular function keyword
      var word = "";
      while (!stream.eol()) {
        var ch = stream.peek();
        if (ch === ":" || ch === "}") break;
        word += stream.next();
      }

      if (word === "") {
        // Empty — just consume one char to avoid infinite loop
        stream.next();
        return "error";
      }

      var lower = word.toLowerCase();
      state.cbsFuncName = lower;

      // Comment function
      if (lower === "comment") {
        state.cbsIsComment = true;
        return "comment cbs-comment-keyword";
      }

      // Escape characters: {{(}}, {{)}}, {{<}}, {{>}}, {{:}}, {{;}}
      if (lower === "(" || lower === ")" || lower === "<" ||
          lower === ">" || lower === ":" || lower === ";") {
        return "atom cbs-escape-char";
      }

      // Variable-mutating functions
      if (mutatingSet[lower]) {
        return "def cbs-function-mutating";
      }

      // Asset/display functions
      if (assetSet[lower]) {
        return "tag cbs-function-asset";
      }

      // Known function
      if (functionSet[lower]) {
        return classifyFunction(lower);
      }

      // Unknown function — might be a user-defined function or typo
      return "variable cbs-function-unknown";
    }

    function classifyFunction(name) {
      if (makeSet(charKeywords)[name])     return "variable-2 cbs-function-char";
      if (makeSet(chatKeywords)[name])     return "variable-2 cbs-function-chat";
      if (makeSet(varKeywords)[name])      return "def cbs-function-var";
      if (makeSet(stringKeywords)[name])   return "string-2 cbs-function-string";
      if (makeSet(numericKeywords)[name])  return "number cbs-function-numeric";
      if (makeSet(arrayKeywords)[name])    return "variable-3 cbs-function-array";
      if (makeSet(logicKeywords)[name])    return "operator cbs-function-logic";
      if (makeSet(dateKeywords)[name])     return "atom cbs-function-date";
      if (makeSet(randomKeywords)[name])   return "atom cbs-function-random";
      if (makeSet(promptKeywords)[name])   return "qualifier cbs-function-prompt";
      if (makeSet(metadataKeywords)[name]) return "meta cbs-function-metadata";
      if (makeSet(stateKeywords)[name])    return "property cbs-function-state";
      if (makeSet(cryptoKeywords)[name])   return "string-2 cbs-function-crypto";
      if (makeSet(aggregateKeywords)[name])return "number cbs-function-aggregate";
      if (makeSet(specialKeywords)[name])  return "builtin cbs-function-special";
      if (makeSet(escapeKeywords)[name])   return "atom cbs-function-escape";
      return "variable cbs-function";
    }

    function tokenCbsArg(stream, state) {
      // Inside a comment — everything is comment text
      if (state.cbsIsComment) {
        while (!stream.eol()) {
          if (stream.match("}}", false)) return "comment cbs-comment-text";
          if (stream.match("::", false)) return "comment cbs-comment-text";
          stream.next();
        }
        return "comment cbs-comment-text";
      }

      // Block operator arguments for #when
      if (state.cbsFuncName === "#when") {
        return tokenWhenArg(stream, state);
      }

      // #each — look for "as" keyword and JSON array
      if (state.cbsFuncName === "#each") {
        return tokenEachArg(stream, state);
      }

      // Regular argument
      return tokenGenericArg(stream, state);
    }

    function tokenWhenArg(stream, state) {
      // Try to match block operators
      var word = "";
      var saved = stream.pos;

      while (!stream.eol()) {
        var ch = stream.peek();
        if (ch === ":" || ch === "}") break;
        word += stream.next();
      }

      if (word === "") {
        stream.next();
        return "error";
      }

      var lower = word.toLowerCase();

      // Block operators (is, isnot, and, or, not, var, toggle, etc.)
      if (blockOperatorSet[lower]) {
        return "keyword cbs-when-operator";
      }

      // Comparison operators
      if (lower === ">" || lower === ">=" || lower === "<" || lower === "<=") {
        return "operator cbs-when-comparison";
      }

      // Nested CBS reference [[var]]
      if (word.match(/^\[\[.+\]\]$/)) {
        return "variable-2 cbs-nested-ref";
      }

      // Numeric literal
      if (word.match(/^-?\d+(\.\d+)?$/)) {
        return "number cbs-arg-number";
      }

      // String/value argument
      return "string cbs-when-value";
    }

    function tokenEachArg(stream, state) {
      // Skip leading whitespace
      if (stream.eatSpace()) return null;

      // JSON array literal
      if (stream.peek() === "[") {
        var depth = 0;
        while (!stream.eol()) {
          var ch = stream.next();
          if (ch === "[") depth++;
          else if (ch === "]") {
            depth--;
            if (depth === 0) break;
          }
          // Stop before :: or }}
          if (stream.match("::", false) || stream.match("}}", false)) break;
        }
        return "string cbs-each-array";
      }

      // "as" keyword
      var word = "";
      var saved = stream.pos;
      while (!stream.eol()) {
        var ch = stream.peek();
        if (ch === ":" || ch === "}" || ch === " " || ch === "\t") break;
        word += stream.next();
      }

      if (word.toLowerCase() === "as") {
        return "keyword cbs-each-as";
      }

      if (word.toLowerCase() === "keep") {
        return "keyword cbs-each-keep";
      }

      // Variable name in each
      if (word !== "") {
        return "def cbs-each-variable";
      }

      stream.next();
      return null;
    }

    function tokenGenericArg(stream, state) {
      // Skip leading whitespace inside args
      if (stream.eatSpace()) return null;

      var word = "";
      while (!stream.eol()) {
        var ch = stream.peek();
        if (ch === ":" || ch === "}") break;
        word += stream.next();
      }

      if (word === "") {
        stream.next();
        return "error";
      }

      // Nested CBS reference [[var]]
      if (word.match(/^\[\[.+\]\]$/)) {
        return "variable-2 cbs-nested-ref";
      }

      // Numeric literal
      if (word.match(/^-?\d+(\.\d+)?$/)) {
        return "number cbs-arg-number";
      }

      // Boolean
      if (word === "true" || word === "false" || word === "1" || word === "0") {
        return "atom cbs-arg-boolean";
      }

      // Dice notation (e.g., 2d6, d20)
      if (word.match(/^\d*d\d+$/i)) {
        return "atom cbs-arg-dice";
      }

      // JSON array
      if (word.match(/^\[.*\]$/)) {
        return "string cbs-arg-json";
      }

      // JSON object
      if (word.match(/^\{.*\}$/)) {
        return "string cbs-arg-json";
      }

      // Key=value pair (for makedict)
      if (word.indexOf("=") > 0 && state.cbsFuncName === "makedict") {
        return "property cbs-arg-keyvalue";
      }

      // Metadata keys
      if (state.cbsFuncName === "metadata") {
        var upper = word.toUpperCase();
        if (["VERSION", "LANGUAGE", "LOCALE", "LANG",
             "BROWSERLANGUAGE", "BROWSERLOCALE", "BROWSERLANG",
             "MODELSHORTNAME", "MODELNAME", "MODELINTERNALID",
             "MODELFORMAT", "MODELPROVIDER", "MODELTOKENIZER",
             "MAXCONTEXT", "RISUTYPE", "MOBILE", "LOCAL", "NODE",
             "MAJORVERSION", "MAJORVER", "MAJOR",
             "IMATEAPOT"].indexOf(upper) >= 0) {
          return "atom cbs-metadata-key";
        }
      }

      // Variable name (first arg of getvar/setvar/etc.)
      if (state.cbsTokenIndex === 1 && mutatingSet[state.cbsFuncName]) {
        return "def cbs-arg-varname";
      }

      if (state.cbsTokenIndex === 1 &&
          (state.cbsFuncName === "getvar" || state.cbsFuncName === "tempvar" ||
           state.cbsFuncName === "gettempvar" || state.cbsFuncName === "getglobalvar")) {
        return "variable-2 cbs-arg-varname";
      }

      // Asset name argument for asset functions
      if (state.cbsTokenIndex === 1 && assetSet[state.cbsFuncName]) {
        return "tag cbs-arg-asset";
      }

      // Slot variable reference
      if (state.cbsFuncName === "slot") {
        return "variable-2 cbs-arg-slot";
      }

      // General string argument
      return "string cbs-arg-string";
    }

    // ─── State Management ──────────────────────────────────────────────

    return {
      startState: function() {
        return {
          inCbs: false,         // Currently inside {{ ... }}
          cbsDepth: 0,          // Nesting depth of {{ }}
          cbsTokenIndex: 0,     // Index of current token (0 = name, 1+ = args)
          cbsIsBlock: false,    // Current expression is a block opener (#when, #each, etc.)
          cbsIsClose: false,    // Current expression is a block close (/)
          cbsIsElse: false,     // Current expression is :else
          cbsIsComment: false,  // Current expression is a comment
          cbsFuncName: null,    // Name of current function
          blockDepth: 0         // Nesting depth of blocks
        };
      },

      copyState: function(state) {
        return {
          inCbs: state.inCbs,
          cbsDepth: state.cbsDepth,
          cbsTokenIndex: state.cbsTokenIndex,
          cbsIsBlock: state.cbsIsBlock,
          cbsIsClose: state.cbsIsClose,
          cbsIsElse: state.cbsIsElse,
          cbsIsComment: state.cbsIsComment,
          cbsFuncName: state.cbsFuncName,
          blockDepth: state.blockDepth
        };
      },

      token: function(stream, state) {
        return tokenBase(stream, state);
      },

      indent: function(state, textAfter) {
        // Indent inside block structures
        var closing = /^\s*\{\{\s*\/\s*\}\}/.test(textAfter) ||
                      /^\s*\{\{:else\}\}/.test(textAfter);
        var depth = state.blockDepth;
        if (closing && depth > 0) depth--;
        return depth * (config.indentUnit || 2);
      },

      electricInput: /^\s*\{\{\s*[\/:]/, // Auto-indent on {{/ and {{:

      blockCommentStart: "{{//",
      blockCommentEnd: "}}",
      lineComment: null,

      fold: "brace"
    };
  });

  // ─── MIME Type Registration ─────────────────────────────────────────

  CodeMirror.defineMIME("text/x-risuai-cbs", "risuai-cbs");
  CodeMirror.defineMIME("text/risuai-cbs", "risuai-cbs");

  // ─── Overlay Mode (CBS inside other modes) ──────────────────────────
  //
  // Usage:
  //   CodeMirror.defineMode("mymode+cbs", function(config) {
  //     return CodeMirror.overlayMode(
  //       CodeMirror.getMode(config, "mymode"),
  //       CodeMirror.getMode(config, "risuai-cbs-overlay")
  //     );
  //   });

  CodeMirror.defineMode("risuai-cbs-overlay", function(config) {
    var cbsMode = CodeMirror.getMode(config, "risuai-cbs");
    return {
      startState: function() { return cbsMode.startState(); },
      copyState: function(s) { return cbsMode.copyState(s); },
      token: function(stream, state) {
        if (stream.match("{{", false) || state.inCbs) {
          return cbsMode.token(stream, state);
        }
        // Outside CBS tags, consume character by character to let base mode handle it
        stream.next();
        return null;
      }
    };
  });

  // ─── Mixed Mode (CBS + Markdown) ───────────────────────────────────
  //
  // This creates a mode where Markdown is the base and CBS expressions are overlayed.

  CodeMirror.defineMode("risuai-cbs-markdown", function(config) {
    var markdownMode = CodeMirror.getMode(config, "markdown");
    var cbsOverlay = CodeMirror.getMode(config, "risuai-cbs-overlay");
    return CodeMirror.overlayMode(markdownMode, cbsOverlay);
  });

  CodeMirror.defineMIME("text/x-risuai-cbs-markdown", "risuai-cbs-markdown");

  // ─── Hint (Autocomplete) Support ────────────────────────────────────

  var allCompletions = [];

  // Build completions list with categories
  function addCompletions(arr, category) {
    for (var i = 0; i < arr.length; i++) {
      allCompletions.push({
        text: arr[i],
        displayText: arr[i],
        className: "cbs-hint-" + category,
        category: category
      });
    }
  }

  addCompletions(charKeywords, "character");
  addCompletions(chatKeywords, "chat");
  addCompletions(varKeywords, "variable");
  addCompletions(stringKeywords, "string");
  addCompletions(numericKeywords, "numeric");
  addCompletions(arrayKeywords, "array");
  addCompletions(logicKeywords, "logic");
  addCompletions(dateKeywords, "datetime");
  addCompletions(randomKeywords, "random");
  addCompletions(assetKeywords, "asset");
  addCompletions(promptKeywords, "prompt");
  addCompletions(metadataKeywords, "metadata");
  addCompletions(stateKeywords, "state");
  addCompletions(cryptoKeywords, "crypto");
  addCompletions(aggregateKeywords, "aggregate");
  addCompletions(specialKeywords, "special");
  addCompletions(escapeKeywords, "escape");

  // Block keywords with # prefix
  for (var i = 0; i < blockKeywords.length; i++) {
    allCompletions.push({
      text: "#" + blockKeywords[i],
      displayText: "#" + blockKeywords[i],
      className: "cbs-hint-block",
      category: "block"
    });
  }

  // Special completions
  allCompletions.push(
    { text: "/", displayText: "/ (close block)", className: "cbs-hint-block", category: "block" },
    { text: ":else", displayText: ":else", className: "cbs-hint-block", category: "block" }
  );

  CodeMirror.registerHelper("hint", "risuai-cbs", function(editor) {
    var cur = editor.getCursor();
    var token = editor.getTokenAt(cur);
    var line = editor.getLine(cur.line);

    // Find the start of the current CBS expression
    var start = cur.ch;
    var inCbs = false;

    // Look backwards for {{
    for (var i = cur.ch - 1; i >= 0; i--) {
      if (line[i] === "{" && i > 0 && line[i - 1] === "{") {
        inCbs = true;
        // Find start of the function name
        start = i + 2; // After {{
        // Skip :: separators to find the current argument start
        var lastSep = line.lastIndexOf("::", cur.ch);
        if (lastSep > i + 1) {
          start = lastSep + 2;
        }
        break;
      }
    }

    if (!inCbs) return null;

    var prefix = line.substring(start, cur.ch).toLowerCase();

    // Filter completions
    var matches = [];
    for (var j = 0; j < allCompletions.length; j++) {
      var comp = allCompletions[j];
      if (comp.text.toLowerCase().indexOf(prefix) === 0) {
        matches.push(comp);
      }
    }

    if (matches.length === 0) return null;

    return {
      list: matches,
      from: CodeMirror.Pos(cur.line, start),
      to: CodeMirror.Pos(cur.line, cur.ch)
    };
  });

  // ─── Bracket Matching Support ────────────────────────────────────────

  // Register {{ and }} as matching brackets
  CodeMirror.registerHelper("fold", "risuai-cbs", function(cm, start) {
    var line = cm.getLine(start.line);
    var startPos = null;

    // Find {{#... on this line
    var match = line.match(/\{\{#/);
    if (!match) return;

    startPos = { line: start.line, ch: match.index + match[0].length };

    // Find matching {{/}}
    var depth = 1;
    for (var i = start.line; i < cm.lineCount(); i++) {
      var text = cm.getLine(i);
      var startSearch = (i === start.line) ? match.index + 3 : 0;

      for (var j = startSearch; j < text.length - 1; j++) {
        if (text[j] === "{" && text[j + 1] === "{") {
          if (text[j + 2] === "#") depth++;
          else if (text[j + 2] === "/") {
            depth--;
            if (depth === 0) {
              // Find the end of {{/}}
              var endMatch = text.indexOf("}}", j);
              if (endMatch >= 0) {
                return {
                  from: startPos,
                  to: { line: i, ch: j }
                };
              }
            }
          }
        }
      }
    }
  });

});
