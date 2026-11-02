/** Pure Kanban helpers. Status tabs and list pagination never limit the board. */
export const KANBAN_STATUSES=['pending','in_progress','completed'];

export function groupKanbanTasks(tasks=[]){
  const groups={pending:[],in_progress:[],completed:[]};
  for(const task of tasks){
    if(Object.hasOwn(groups,task.status))groups[task.status].push(task);
  }
  return groups;
}

export function selectKanbanTasks({tasks=[],members=[],search='',priority='all',assigned='all',sort='due',focus='mine'}={}){
  const needle=String(search).trim().toLocaleLowerCase();
  return tasks.filter(task=>{
    if(priority!=='all' && task.priority!==priority)return false;
    if(focus==='all' && assigned!=='all' && (assigned==='unassigned'
      ? task.assigned_to!=null : Number(task.assigned_to)!==Number(assigned)))return false;
    if(!needle)return true;
    const memberName=members.find(member=>Number(member.id)===Number(task.assigned_to))?.name||'Unassigned';
    return [task.title,task.description,task.category,task.due_date,memberName]
      .some(value=>String(value||'').toLocaleLowerCase().includes(needle));
  }).sort((a,b)=>{
    if(sort==='newest')return Number(b.id)-Number(a.id);
    if(sort==='priority'){
      const rank={high:0,normal:1,low:2};
      return (rank[a.priority]??1)-(rank[b.priority]??1) || String(a.due_date||'').localeCompare(String(b.due_date||''));
    }
    return String(a.due_date||'').localeCompare(String(b.due_date||'')) || Number(a.id)-Number(b.id);
  });
}
