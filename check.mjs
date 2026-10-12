import {pathToFileURL} from 'node:url'
export function validateHealth(status,h,{now=new Date(),expectedResults=1,expectedChannels=1,requiredSettings={}}={}) {
  const fail=message=>{throw Error(message)}
  if(status!==200||h?.ok!==true)fail(`Unhealthy response: HTTP ${status}`)
  for(const field of ['problems','warnings'])if(!Array.isArray(h[field])||h[field].length)fail(`${field}: ${JSON.stringify(h[field]??'missing')}`)
  const fresh=value=>{const t=Date.parse(value);if(!Number.isFinite(t)||now.getTime()-t>300000||t-now.getTime()>60000)fail('Missing/stale successful observation')}
  fresh(h.checkedAt)
  for(const [name,minimum,timeField] of [['results',expectedResults,'checked_at'],['channels',expectedChannels,'last_shallow_poll_at']]) {
    if(!Array.isArray(h[name])||h[name].length<minimum)fail(`Missing ${name}`)
    for(const row of h[name]){if(row.last_error)fail(`${name}: ${row.last_error}`);fresh(row[timeField])}
  }
  for(const [key,value] of Object.entries(requiredSettings))if(h.runtime?.[key]!==value)fail(`Required runtime setting ${key} is unavailable`)
}
export async function checkHealth(url,options={}) {
  if(!url||!url.startsWith('https://'))throw Error('A public HTTPS monitor URL is required')
  for(let attempt=1;attempt<=3;attempt++) {
    try {
      const r=await fetch(url,{signal:AbortSignal.timeout(12000),redirect:'error'}),h=await r.json()
      validateHealth(r.status,h,options);console.log(`Successful observations verified at ${h.checkedAt}`);return
    } catch(e){console.error(`Attempt ${attempt}/3: ${e.message}`);if(attempt===3)throw e;await new Promise(r=>setTimeout(r,3000))}
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{await checkHealth(process.env.MONITOR_URL,{expectedResults:Number(process.env.EXPECTED_RESULTS||1),expectedChannels:Number(process.env.EXPECTED_CHANNELS||1),requiredSettings:JSON.parse(process.env.REQUIRED_SETTINGS||'{}')})}catch{process.exitCode=1}
}
