import test from 'node:test';
import assert from 'node:assert/strict';
import {upcomingReminders,shiftCalendarSelection} from '../src/calendarUtils.js';
import {callablePhone,phoneHref} from '../src/contactPhone.js';

test('upcoming reminders excludes earlier times on the same date',()=>{
  const now=new Date(2026,9,30,12,28);
  const records=[
    {id:'past',event_date:'2026-10-30',event_time:'09:00'},
    {id:'future',event_date:'2026-10-30',event_time:'15:00'},
    {id:'tomorrow',event_date:'2026-10-31',event_time:'08:00'},
    {id:'yesterday',event_date:'2026-10-29',event_time:'19:30'}
  ];
  assert.deepEqual(upcomingReminders(records,now).map(x=>x.id),['future','tomorrow']);
});

test('upcoming reminders handles year boundary',()=>{
  const now=new Date(2026,11,31,23,59);
  assert.deepEqual(upcomingReminders([{event_date:'2027-01-01',event_time:'00:01'}],now).length,1);
});

test('contact phone rejects placeholder data and normalizes callable numbers',()=>{
  for(const invalid of ['', '000-000-1011', '000-000-0000', '1111111111', 'abc','+63 9XX XXX XXXX'])
    assert.equal(callablePhone(invalid),false,invalid);
  for(const valid of ['0917 123 4567','+63 917 123 4567','202-555-0123'])
    assert.equal(callablePhone(valid),true,valid);
  assert.equal(phoneHref('+63 (917) 123-4567'),'tel:+639171234567');
});

test('calendar month navigation keeps the selected day in the displayed month',()=>{
  assert.deepEqual(shiftCalendarSelection('2026-01','2026-01-31',1), {month:'2026-02',selected:'2026-02-28'});
  assert.deepEqual(shiftCalendarSelection('2028-01','2028-01-31',1), {month:'2028-02',selected:'2028-02-29'});
  assert.deepEqual(shiftCalendarSelection('2026-12','2026-12-30',1), {month:'2027-01',selected:'2027-01-30'});
});
