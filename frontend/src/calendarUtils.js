// Local household calendar timestamps: the existing app stores date and HH:mm separately.
// Compare BOTH fields so a completed morning appointment is not called "upcoming" at night.
export function upcomingReminders(records = [], now = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  const minute = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return records.filter(record => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record?.event_date || '')) return false;
    const time = /^([01]\d|2[0-3]):[0-5]\d/.test(record?.event_time || '') ? record.event_time.slice(0, 5) : '00:00';
    return `${record.event_date}T${time}` >= minute;
  }).sort((a, b) => `${a.event_date}T${a.event_time || ''}`.localeCompare(`${b.event_date}T${b.event_time || ''}`));
}

// Keep the highlighted date in the month currently displayed (including leap years).
export function shiftCalendarSelection(month,selected,byMonths) {
  const [year,monthNumber]=month.split('-').map(Number);
  const date=new Date(year,monthNumber-1+byMonths,1);
  const pad=n=>String(n).padStart(2,'0');
  const targetMonth=`${date.getFullYear()}-${pad(date.getMonth()+1)}`;
  const lastDay=new Date(date.getFullYear(),date.getMonth()+1,0).getDate();
  const day=Math.min(Math.max(Number(selected?.slice(-2))||1,1),lastDay);
  return {month:targetMonth,selected:`${targetMonth}-${pad(day)}`};
}
