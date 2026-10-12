import test from 'node:test'
import assert from 'node:assert/strict'
import { validateHealth } from './check.mjs'
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
