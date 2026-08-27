const Database = require('better-sqlite3');

// Test 1: default unicode61
const t = new Database(':memory:');
t.exec("CREATE VIRTUAL TABLE test_fts USING fts5(text, tokenize='unicode61')");
t.exec("INSERT INTO test_fts VALUES ('存取冲突;访问冲突')");
t.exec("INSERT INTO test_fts VALUES ('n. 冲突, 矛盾')");
t.exec("INSERT INTO test_fts VALUES ('[网络] 利益冲突')");

console.log('=== unicode61 (default) ===');
console.log('MATCH 冲突:', t.prepare("SELECT count(*) as c FROM test_fts WHERE test_fts MATCH '冲突'").get().c);
console.log('MATCH 存取:', t.prepare("SELECT count(*) as c FROM test_fts WHERE test_fts MATCH '存取'").get().c);
console.log('MATCH 利益:', t.prepare("SELECT count(*) as c FROM test_fts WHERE test_fts MATCH '利益'").get().c);
console.log('MATCH 利益冲突:', t.prepare("SELECT count(*) as c FROM test_fts WHERE test_fts MATCH '利益冲突'").get().c);

// Test 2: unicode61 with cjk=1
const t2 = new Database(':memory:');
t2.exec("CREATE VIRTUAL TABLE test2_fts USING fts5(text, tokenize='unicode61 cjk 1')");
t2.exec("INSERT INTO test2_fts VALUES ('存取冲突;访问冲突')");
t2.exec("INSERT INTO test2_fts VALUES ('n. 冲突, 矛盾')");
t2.exec("INSERT INTO test2_fts VALUES ('[网络] 利益冲突')");

console.log('\n=== unicode61 cjk=1 ===');
console.log('MATCH 冲突:', t2.prepare("SELECT count(*) as c FROM test2_fts WHERE test2_fts MATCH '冲突'").get().c);
console.log('MATCH 存取:', t2.prepare("SELECT count(*) as c FROM test2_fts WHERE test2_fts MATCH '存取'").get().c);
console.log('MATCH 利益:', t2.prepare("SELECT count(*) as c FROM test2_fts WHERE test2_fts MATCH '利益'").get().c);

t.close();
t2.close();

// Test 3: try with literal content output to see tokens
const t3 = new Database(':memory:');
t3.exec("CREATE VIRTUAL TABLE test3_fts USING fts5(text, tokenize='unicode61')");
t3.exec("INSERT INTO test3_fts VALUES ('n. 冲突, 矛盾')");

// Use FTS5 bm25 ranking to understand tokenization
const r1 = t3.prepare("SELECT rowid, rank FROM test3_fts WHERE test3_fts MATCH '冲突'").all();
console.log('\n=== Row with match ===');
console.log(JSON.stringify(r1));

// Also test: does MATCH find substrings?
const t4 = new Database(':memory:');
t4.exec("CREATE VIRTUAL TABLE test4_fts USING fts5(text, tokenize='unicode61')");
t4.exec("INSERT INTO test4_fts VALUES ('abcd')");
console.log('\n=== ASCII test ===');
console.log('MATCH abc:', t4.prepare("SELECT count(*) as c FROM test4_fts WHERE test4_fts MATCH 'abc'").get().c);
console.log('MATCH ab:', t4.prepare("SELECT count(*) as c FROM test4_fts WHERE test4_fts MATCH 'ab'").get().c);
