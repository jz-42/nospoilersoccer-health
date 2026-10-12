import test from 'node:test'
import assert from 'node:assert/strict'
import { validateHealth, checkExpiry, alertSignature } from './check.mjs'
const now=new Date('2026-10-12T02:00:00Z')
const good=()=>({ok:true,checkedAt:now.toISOString(),problems:[],warnings:[],results:[{checked_at:now.toISOString(),last_error:null}],channels:[{last_shallow_poll_at:now.toISOString(),last_error:null}],runtime:{publicEnabled:true}})
const options={now,expectedResults:1,expectedChannels:1,requiredSettings:{publicEnabled:true}}
test('accepts complete current health',()=>assert.doesNotThrow(()=>validateHealth(200,good(),options)))
for(const status of [404,503])test(`rejects HTTP ${status}`,()=>assert.throws(()=>validateHealth(status,good(),options)))
test('rejects missing or invalid health instead of treating HTTP 200 as sufficient',()=>{
 for(const h of [null,{}, {...good(),ok:false},{...good(),results:[]},{...good(),channels:[]},{...good(),warnings:undefined}])assert.throws(()=>validateHealth(200,h,options))
})
test('rejects explicit problems, warnings and disabled publication',()=>{
 for(const h of [{...good(),problems:['stale']},{...good(),warnings:['catalog:error']},{...good(),runtime:{publicEnabled:false}}])assert.throws(()=>validateHealth(200,h,options))
})
test('checks actual successful timestamps including future clock anomalies',()=>{
 for(const time of ['invalid','2026-10-12T01:54:59Z','2026-10-12T02:02:00Z']){
  for(const h of [{...good(),checkedAt:time},{...good(),results:[{checked_at:time}]},{...good(),channels:[{last_shallow_poll_at:time}]}])assert.throws(()=>validateHealth(200,h,options))
 }
})
test('rejects current provider errors',()=>assert.throws(()=>validateHealth(200,{...good(),results:[{checked_at:now.toISOString(),last_error:'error'}]},options)))
test('unhealthy responses name their problems',()=>assert.throws(()=>validateHealth(503,{...good(),ok:false,problems:['feed:nbc:stale']},options),/feed:nbc:stale/))
const rdap=date=>async url=>url.includes('iana.org')?Response.json({services:[[['net'],['https://n/']],[['com'],['https://registry.example/com/v1/']]]})
 :url==='https://registry.example/com/v1/domain/example.com'?Response.json({events:[{eventAction:'expiration',eventDate:date}]}):new Response('no',{status:404})
test('flags a domain or certificate close to expiry, or an expiry that cannot be read',async()=>{
 const cert=date=>async()=>new Date(date)
 assert.deepEqual(await checkExpiry('example.com',{now,fetchImpl:rdap('2027-06-10T00:00:00Z'),certExpiry:cert('2027-01-05T00:00:00Z')}),[])
 assert.deepEqual(await checkExpiry('example.com',{now,fetchImpl:rdap('2026-11-01T00:00:00Z'),certExpiry:cert('2026-10-20T00:00:00Z')}),['Domain example.com expires in 19 days','TLS certificate for example.com expires in 7 days'])
 const broken=await checkExpiry('example.com',{now,fetchImpl:async()=>{throw Error('offline')},certExpiry:async()=>{throw Error('refused')}})
 assert.deepEqual(broken,['Domain expiry lookup failed: offline','TLS certificate check failed: refused'])
})
test('alert signatures ignore changing numbers but separate different failures',()=>{
 assert.equal(alertSignature('warnings: ["usage:workerRequests_at_71pct"]'),alertSignature('warnings: ["usage:workerRequests_at_74pct"]'))
 assert.notEqual(alertSignature('warnings: ["usage:workerRequests_at_71pct"]'),alertSignature('warnings: ["usage:d1RowsRead_at_71pct"]'))
})
