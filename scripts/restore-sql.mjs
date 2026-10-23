// D1 dumps may insert rows before a referenced table has been declared.
// Move table definitions ahead of data without interpreting text/blob values.
export function prepareRestoreSql(sql) {
  const tables = [],
    remainder = [];
  let start = 0,
    quote = "",
    comment = "",
    word = "",
    words = [];
  function endWord() {
    if (word && words.length < 2) words.push(word.toUpperCase());
    word = "";
  }
  function endStatement(end) {
    endWord();
    const statement = sql.slice(start, end);
    (words[0] === "CREATE" && words[1] === "TABLE" ? tables : remainder).push(
      statement,
    );
    start = end;
    words = [];
  }
  for (let i = 0; i < sql.length; i++) {
    const character = sql[i],
      next = sql[i + 1];
    if (comment === "line") {
      if (character === "\n") comment = "";
      continue;
    }
    if (comment === "block") {
      if (character === "*" && next === "/") {
        comment = "";
        i++;
      }
      continue;
    }
    if (quote) {
      const closing = quote === "[" ? "]" : quote;
      if (character === closing) {
        if (quote !== "[" && next === closing) i++;
        else quote = "";
      }
      continue;
    }
    if (character === "-" && next === "-") {
      endWord();
      comment = "line";
      i++;
      continue;
    }
    if (character === "/" && next === "*") {
      endWord();
      comment = "block";
      i++;
      continue;
    }
    if (["'", '"', "`", "["].includes(character)) {
      endWord();
      quote = character;
      continue;
    }
    if (/[a-z0-9_]/i.test(character)) word += character;
    else endWord();
    if (character === ";") endStatement(i + 1);
  }
  endStatement(sql.length);
  // Trigger fragments stay in their original sequence after all table DDL.
  return tables.join("\n") + "\n" + remainder.join("");
}
