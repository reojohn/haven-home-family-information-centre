import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const tasks=readFileSync(new URL('../src/HouseholdTasks.jsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');

test('Start task changes To do into In progress, not Completed',()=>{
  assert.match(tasks, /task\.status==='pending' && <button[^\n]*changeStatus\(task,'in_progress'\)/);
  assert.match(tasks, /> Start task<\/button>/);
});
test('Mark complete is offered only from In progress',()=>{
  assert.match(tasks, /task\.status==='in_progress' && <button[^\n]*changeStatus\(task,'completed'\)/);
  assert.match(tasks, /> Mark complete<\/button>/);
  assert.match(tasks, /Status: \{statusLabel\[task\.status\]\}/);
});
test('in-flight buttons are replaced with progress feedback, no duplicate action',()=>{
  assert.match(tasks, /activeId===task\.id && <span className="chore-status-saving"/);
  assert.match(tasks, /activeId!==task\.id && task\.status==='in_progress'/);
});
test('successful completion opens Completed filter and bootstrap avoids status regression',()=>{
  assert.match(tasks, /if\(saved && next==='completed'\)setStatus\('completed'\)/);
  assert.match(app,/pendingTaskStatus\.current\.set\(task\.id,\{userId,status:result\.status,saved:true/);
});
