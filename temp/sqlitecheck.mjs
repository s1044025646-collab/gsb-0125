import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(':memory:');
db.exec('create table t(a)');
db.prepare('insert into t values(?)').run(1);
console.log('node:sqlite OK', JSON.stringify(db.prepare('select a from t').get()));
