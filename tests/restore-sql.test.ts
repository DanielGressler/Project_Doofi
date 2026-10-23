import { expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { prepareRestoreSql } from "../scripts/restore-sql.mjs";

it("restaura no D1 quando a definição da tabela referenciada aparece depois dos dados", async () => {
  const sql = `PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE restore_orders(id TEXT PRIMARY KEY, customer_id TEXT REFERENCES restore_customers(id));
INSERT INTO restore_orders VALUES('o1','c1');
CREATE TABLE restore_customers(id TEXT PRIMARY KEY, name TEXT);
INSERT INTO restore_customers VALUES('c1','Cliente fictício');`;
  await env.DB.exec(prepareRestoreSql(sql));
  expect(
    await env.DB.prepare(
      "SELECT c.name FROM restore_orders o JOIN restore_customers c ON c.id=o.customer_id",
    ).first(),
  ).toEqual({ name: "Cliente fictício" });
  expect(await env.DB.prepare("PRAGMA foreign_key_check").all()).toMatchObject({
    results: [],
  });
});

it("texto com SQL aparente, aspas e ponto e vírgula permanece dado literal", () => {
  const literal =
    "INSERT INTO example VALUES('linha;''aspas\nCREATE TABLE decoy(id);\nfim');";
  const sql = `CREATE TABLE example(note TEXT);\n${literal}\nCREATE TABLE final_table(id INTEGER);`;
  const prepared = prepareRestoreSql(sql);
  expect(prepared).toContain(literal);
  expect(prepared.indexOf("CREATE TABLE final_table")).toBeLessThan(
    prepared.indexOf("INSERT INTO example"),
  );
  expect(prepared.indexOf("CREATE TABLE decoy")).toBeGreaterThan(
    prepared.indexOf("INSERT INTO example"),
  );
});

it("comentários, identificadores e corpo de trigger são preservados", () => {
  const trigger =
    "CREATE TRIGGER insert_log AFTER INSERT ON records BEGIN INSERT INTO log VALUES('CREATE TABLE;'); INSERT INTO log VALUES('segunda;'); END;";
  const sql = `-- CREATE TABLE fake(id);\nCREATE TABLE [records](id INTEGER);\nINSERT INTO [records] VALUES(1);\n/* ; CREATE TABLE other_fake(id); */\nCREATE TABLE log(note TEXT);\n${trigger}`;
  const prepared = prepareRestoreSql(sql);
  expect(prepared).toContain(trigger);
  expect(prepared).toContain("INSERT INTO [records] VALUES(1);");
  expect(prepared.indexOf("CREATE TABLE log")).toBeLessThan(
    prepared.indexOf("INSERT INTO [records]"),
  );
});
