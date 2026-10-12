import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {appendFileSync} from 'node:fs'
import tls from 'node:tls'
export function validateHealth(status,h,{now=new Date(),expectedResults=1,expectedChannels=1,requiredSettings={}}={}) {
  const fail=message=>{throw Error(message)}
  if(status!==200||h?.ok!==true)fail(`Unhealthy response: HTTP ${status}${Array.isArray(h?.problems)&&h.problems.length?` ${JSON.stringify(h.problems)}`:''}`)
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
const DAY=86400000
export function peerCertExpiry(host){
  return new Promise((resolve,reject)=>{
    const socket=tls.connect({host,port:443,servername:host,timeout:10000},()=>{const cert=socket.getPeerCertificate();socket.end();resolve(new Date(cert.valid_to))})
    socket.on('timeout',()=>{socket.destroy();reject(Error('TLS connection timed out'))});socket.on('error',reject)
  })
}
// Renewal is automatic for both (registrar auto-renew, Cloudflare certificates), so
// these only fire if that automation fails: the domain a month out, the certificate two weeks out.
export async function checkExpiry(domain,{now=new Date(),domainDays=30,certDays=14,fetchImpl=fetch,certExpiry=peerCertExpiry}={}){
  const problems=[]
  try{
    // IANA's bootstrap file names the registry that answers for each domain ending.
    const tld=domain.split('.').at(-1)
    const bootstrap=await (await fetchImpl('https://data.iana.org/rdap/dns.json',{signal:AbortSignal.timeout(12000)})).json()
    const base=bootstrap.services?.find(([tlds])=>tlds.includes(tld))?.[1]?.[0]
    if(!base)throw Error(`no registry for .${tld}`)
    const r=await fetchImpl(`${base.replace(/\/?$/,'/')}domain/${domain}`,{headers:{accept:'application/rdap+json'},signal:AbortSignal.timeout(12000)})
    const expires=Date.parse((await r.json()).events?.find(e=>e.eventAction==='expiration')?.eventDate)
    if(!Number.isFinite(expires))problems.push('Domain expiry unavailable')
    else if(expires-now.getTime()<domainDays*DAY)problems.push(`Domain ${domain} expires in ${Math.floor((expires-now.getTime())/DAY)} days`)
  }catch(e){problems.push(`Domain expiry lookup failed: ${e.message}`)}
  try{
    const expires=(await certExpiry(domain)).getTime()
    if(!Number.isFinite(expires)||expires-now.getTime()<certDays*DAY)problems.push(`TLS certificate for ${domain} expires in ${Math.floor((expires-now.getTime())/DAY)} days`)
  }catch(e){problems.push(`TLS certificate check failed: ${e.message}`)}
  return problems
}
// The same failure (ignoring changing numbers) is reported once a day; a new one at once.
export const alertSignature=message=>createHash('sha256').update(message.replace(/[0-9]+/g,'#')).digest('hex').slice(0,16)
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const failures=[]
  try{await checkHealth(process.env.MONITOR_URL,{expectedResults:Number(process.env.EXPECTED_RESULTS||1),expectedChannels:Number(process.env.EXPECTED_CHANNELS||1),requiredSettings:JSON.parse(process.env.REQUIRED_SETTINGS||'{}')})}catch(e){failures.push(e.message)}
  // Hourly is plenty for dates months away: the first dispatched run of each hour, and every scheduled run.
  if(process.env.EXPIRY_DOMAIN&&(new Date().getUTCMinutes()<10||process.env.GITHUB_EVENT_NAME==='schedule'))failures.push(...await checkExpiry(process.env.EXPIRY_DOMAIN))
  const message=failures.join('; ')
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`failed=${failures.length>0}\nsignature=${failures.length?alertSignature(message):''}\nday=${new Date().toISOString().slice(0,10)}\nmessage=${message.replace(/[\r\n]+/g,' ').slice(0,900)}\n`)
  else if(failures.length)process.exitCode=1
  if(failures.length)console.error(message)
}
