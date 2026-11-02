import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const main=read('../src/main.jsx');
const lists=read('../src/HouseholdInformationLists.jsx');
const tasks=read('../src/HouseholdTasks.jsx');
test('primary Calendar action uses selected date on reminder route',()=>{
 assert.match(main,/actions=\{<Link to=\{`\/calendar\/new\?date=\$\{selected\}`\}/);
 assert.match(main,/event_date:query\.get\('date'\)\|\|localToday\(\)/);
});
test('existing household records provide explicit edit actions',()=>{
 assert.match(lists,/Edit announcement:/);
 assert.match(lists,/Edit contact|Edit \$\{displayText\(c\.name/);
 assert.match(main,/\/bills\/\$\{id\}`,'PATCH'/);
 assert.match(main,/Bill details saved\. Payment status was preserved/);
});
test('task metrics and user profile expose their meaning',()=>{
 assert.match(tasks,/Included in To do \/ In progress/);
 assert.match(main,/is_household_owner \? 'Household creator' : 'Household member'/);
});
