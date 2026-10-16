export function retailerObservations(observations,sourceIds){
 const current=observations.filter(o=>sourceIds.has(o.source_id)&&o.review?.decision!=='superseded').sort((a,b)=>Date.parse(b.observed_at)-Date.parse(a.observed_at)||b.revision_number-a.revision_number);
 return {latest:current[0]??null,outstanding:current.slice(1).filter(o=>['pending','quarantined'].includes(o.review?.decision))};
}
