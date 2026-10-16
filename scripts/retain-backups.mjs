// Delete only Freddo backup artifacts, retaining the newest seven daily and four weekly.
const repository='ashsquires/TheFreddoIndex',headers={Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
const artifacts=[];
for(let page=1;;page++){
 const response=await fetch(`https://api.github.com/repos/${repository}/actions/artifacts?per_page=100&page=${page}`,{headers});if(!response.ok)throw Error('Could not list backup artifacts');
 const data=await response.json();artifacts.push(...data.artifacts);if(data.artifacts.length<100)break;
}
for(const [kind,keep] of [['daily',7],['weekly',4]]){
 const matching=artifacts.filter(a=>new RegExp(`^freddo-${kind}-\\d{4}-\\d{2}-\\d{2}-\\d+$`).test(a.name)).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
 for(const artifact of matching.slice(keep)){
  const response=await fetch(`https://api.github.com/repos/${repository}/actions/artifacts/${artifact.id}`,{method:'DELETE',headers});if(!response.ok)throw Error('Could not apply backup retention');
 }
}
