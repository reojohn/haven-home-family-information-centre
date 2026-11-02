import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {groupKanbanTasks,selectKanbanTasks} from '../src/choreKanbanUtils.js';

const tasks=[
  {id:1,title:'Sweep',status:'pending',assigned_to:5,priority:'normal',due_date:'2026-11-04',description:'Living room',category:'Cleaning'},
  {id:2,title:'Dishes',status:'in_progress',assigned_to:5,priority:'high',due_date:'2026-11-02',description:'Kitchen',category:'Cleaning'},
  {id:3,title:'Groceries',status:'completed',assigned_to:7,priority:'low',due_date:'2026-11-01',description:'Store run',category:'Errands'},
  {id:4,title:'Clean bathroom',status:'pending',assigned_to:null,priority:'high',due_date:'2026-11-03',description:'Bathroom',category:'Cleaning'}
];
const members=[{id:5,name:'Reo Andohuyan'},{id:7,name:'Tyron Brasileno'}];
test('Kanban groups all stages independently and does not mutate records',()=>{
  const before=JSON.stringify(tasks);
  const grouped=groupKanbanTasks(tasks);
  assert.deepEqual(Object.fromEntries(Object.entries(grouped).map(([k,v])=>[k,v.length])),{pending:2,in_progress:1,completed:1});
  assert.equal(JSON.stringify(tasks),before);
});
test('Kanban filters retain all task statuses, not just Active or a page of ten',()=>{
  const filtered=selectKanbanTasks({tasks,members,focus:'all'});
  assert.equal(filtered.length,4);
  assert.deepEqual(new Set(filtered.map(x=>x.status)),new Set(['pending','in_progress','completed']));
});
test('Kanban honors text, priority and assignee filters while preserving source data',()=>{
  assert.deepEqual(selectKanbanTasks({tasks,members,search:'reo',focus:'all'}).map(x=>x.id),[2,1]);
  assert.deepEqual(selectKanbanTasks({tasks,members,priority:'high',focus:'all'}).map(x=>x.id),[2,4]);
  assert.deepEqual(selectKanbanTasks({tasks,members,assigned:'unassigned',focus:'all'}).map(x=>x.id),[4]);
  assert.equal(tasks[0].title,'Sweep');
});
test('Kanban uses the existing safe two-step handler and assignee permission gate',()=>{
  const source=readFileSync(new URL('../src/ChoreKanbanBoard.jsx',import.meta.url),'utf8');
  const page=readFileSync(new URL('../src/HouseholdTasks.jsx',import.meta.url),'utf8');
  assert.match(source,/task\.assigned_to!=null && Number\(task\.assigned_to\)===Number\(currentUserId\)/);
  assert.match(source,/onClick=\{\(\)=>onStatusChange\(task,next\)\}/);
  assert.match(page,/onStatusChange=\{changeStatus\}/);
  assert.match(page,/pending:'in_progress',in_progress:'completed',completed:'pending'/);
});
test('Kanban is collapsible and included under the existing chore table',()=>{
  const board=readFileSync(new URL('../src/ChoreKanbanBoard.jsx',import.meta.url),'utf8');
  const page=readFileSync(new URL('../src/HouseholdTasks.jsx',import.meta.url),'utf8');
  assert.match(board,/aria-expanded=\{expanded\}/);
  assert.match(board,/\{expanded && <div id=\{panelId\}/);
  assert.ok(page.indexOf('<ChoreKanbanBoard')>page.indexOf('className="chores-pagination"'));
});
