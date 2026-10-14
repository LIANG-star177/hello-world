import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const folder = await mkdtemp(join(tmpdir(), 'present-smoke-'));
const base = 'http://127.0.0.1:3100';
const server = spawn(process.execPath, ['scripts/start-cloud.mjs'], {env:{...process.env, NODE_ENV:'production', AUTH_SECRET:randomBytes(32).toString('hex'), TEACHER_PASSWORD:'smoke-only-password', DATABASE_PATH:join(folder,'test.sqlite'), ENABLE_SIMULATION:'false', PUBLIC_BASE_URL:'https://attendance.example.test', PORT:'3100'}, stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data', d=>logs+=d);server.stderr.on('data',d=>logs+=d);
async function call(path,body,cookie=''){const r=await fetch(base+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',cookie,host:'attendance.example.test',origin:'https://attendance.example.test'},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw Error(`${path}: ${r.status} ${await r.text()}`);return {data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
try{
 let ready=false;for(let i=0;i<80;i++){try{const r=await fetch(base);if(r.ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,logs);
 assert.equal((await fetch(base+'/student')).status,200);assert.equal((await fetch(base+'/api/health')).status,200);
 const teacher=(await call('login',{role:'teacher',password:'smoke-only-password'})).cookie;
 const now=Date.now();const session=(await call('sessions',{course_id:'LAWS7701',name:'Smoke',classroom:'Placeholder',latitude:0,longitude:0,start:now-1000,end:now+180000,normal_radius:100,review_radius:300,max_adjustment:50,placeholder:true},teacher)).data;
 const q=(await call(`sessions/${session.id}/qr`,undefined,teacher)).data;assert.ok(q.url.startsWith('https://attendance.example.test/student?token='));
 const student=(await call('login',{role:'student',id:'S001',name:'Demo Student 1'})).cookie;
 const record=(await call('checkin',{token:q.token,raw:{latitude:0,longitude:0},corrected:{latitude:0,longitude:0},accuracy:15,locationTimestamp:Date.now()},student)).data;
 assert.equal(record.status,'NORMAL');
 const dashboard=(await call(`sessions/${session.id}/records`,undefined,teacher)).data;assert.equal(dashboard.summary.checked,1);assert.equal(dashboard.summary.absent,24);
 const csv=await fetch(`${base}/api/sessions/${session.id}/csv`,{headers:{cookie:teacher}});assert.ok((await csv.text()).includes('Demo Student 1'));
 console.log('Production HTTP smoke passed: pages, auth, create session, QR, check-in, dashboard and CSV.');
} catch(e){console.error(logs);throw e;} finally {server.kill('SIGTERM');if(server.exitCode===null) await new Promise(resolve=>server.once('exit',resolve));await rm(folder,{recursive:true,force:true});}
