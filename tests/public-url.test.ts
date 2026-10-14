import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicOrigin,checkinUrl,allowedOrigin} from '../lib/public-url';
test('public QR uses configured HTTPS address even behind an internal origin',()=>{
 const original=process.env.PUBLIC_BASE_URL;
 try{process.env.PUBLIC_BASE_URL='https://attendance.example.org';assert.equal(checkinUrl(new Request('http://localhost:3000/api/qr'),'token'),'https://attendance.example.org/student?token=token');}
 finally{if(original===undefined)delete process.env.PUBLIC_BASE_URL;else process.env.PUBLIC_BASE_URL=original;}
});
test('invalid configured URLs and localhost cannot become the public QR address',()=>{
 const original=process.env.PUBLIC_BASE_URL;
 try{for(const url of ['http://attendance.example.org','https://localhost','https://example.org/subpath','https://user:password@example.org','https://example.org?secret=x']){process.env.PUBLIC_BASE_URL=url;assert.throws(()=>publicOrigin(new Request('http://localhost')));}}
 finally{if(original===undefined)delete process.env.PUBLIC_BASE_URL;else process.env.PUBLIC_BASE_URL=original;}
});

test('configured public origin works behind proxy host rewrite and rejects foreign origins',()=>{
 const original=process.env.PUBLIC_BASE_URL;
 try{process.env.PUBLIC_BASE_URL='https://attendance.example.org';assert.equal(allowedOrigin(new Request('http://localhost:3000/api/login',{headers:{host:'localhost:3000',origin:'https://attendance.example.org'}})),true);assert.equal(allowedOrigin(new Request('http://localhost:3000/api/login',{headers:{origin:'https://evil.example.org'}})),false);}
 finally{if(original===undefined)delete process.env.PUBLIC_BASE_URL;else process.env.PUBLIC_BASE_URL=original;}
});
