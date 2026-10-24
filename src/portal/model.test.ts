import { describe, expect, it } from 'vitest';
import { createWorkspace, DEMO_WORKSPACE_KEY, emptyProfile, orderAction, parsePrice, readWorkspace, setOffer, splitAmount, writeWorkspace } from './model';

const profile=()=>({...emptyProfile(),name:'Demo Expert',country:'UA',currency:'EUR'});

describe('Expert demo workspace',()=>{
 it('parses prices into exact minor units and keeps each split balanced',()=>{
  expect(parsePrice('3000,50')).toBe(300050);
  expect(parsePrice('30.01')).toBe(3001);
  for(const invalid of ['','0','-2','3.456','1e3','1000001'])expect(parsePrice(invalid)).toBeNull();
  expect(splitAmount(300000)).toEqual({platform:120000,expert:180000});
  expect(splitAmount(100000,'personal')).toEqual({platform:33300,expert:66700});
  for(const amount of [1,101,10001,300000]){
   const split=splitAmount(amount,'personal');expect(split.expert+split.platform).toBe(amount);
  }
 });
 it('keeps unpaid tracks locked and enforces review, one question round and verdict order',()=>{
  const workspace=createWorkspace(profile());
  const unpaid=workspace.orders[3];
  expect(()=>orderAction(unpaid,'review')).toThrow('PAYMENT_REQUIRED');
  let order=workspace.orders[0];
  expect(()=>orderAction(order,'ready')).toThrow('INVALID_STEP');
  order=orderAction(order,'review');order=orderAction(order,'questions');
  expect(()=>orderAction(order,'answer',' ')).toThrow('INVALID_STEP');
  order=orderAction(order,'answer','A fictional reply');order=orderAction(order,'ready');
  expect(order.status).toBe('completed');expect(order.verdict).toBe('ready');
  expect(()=>orderAction(order,'questions')).toThrow('INVALID_STEP');
 });
 it('requires a ready track, at most two services and explicit personal introduction consent',()=>{
  const order=createWorkspace(profile()).orders[2];
  expect(()=>setOffer(order,['introduction'],false,null)).toThrow('INTRODUCTION_CONFIRMATION_REQUIRED');
  expect(()=>setOffer(order,['selection','preparation','introduction'],true,null)).toThrow('INVALID_SERVICES');
  expect(()=>setOffer({...order,verdict:'work'},['selection'],false,null)).toThrow('NOT_READY');
  const result=setOffer(order,['selection','introduction'],true,1500000);
  expect(result.introductionConfirmed).toBe(true);expect(result.offerPriceMinor).toBe(1500000);
 });
 it('saves only the local demo workspace and never reprices existing orders when the profile changes',()=>{
  const data=new Map<string,string>();const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
  const workspace=createWorkspace(profile());
  workspace.profile.priceMinor=5500;workspace.profile.currency='USD';
  expect(writeWorkspace(storage,workspace)).toBe(true);
  expect([...data.keys()]).toEqual([DEMO_WORKSPACE_KEY]);
  const restored=readWorkspace(storage)!;
  expect(restored.profile.currency).toBe('USD');
  expect(restored.orders[0].currency).toBe('RUB');expect(restored.orders[0].totalMinor).toBe(300000);
 });
 it('rejects malformed storage, unsupported image data and tampered payment amounts',()=>{
  expect(readWorkspace({getItem:()=>'{broken'})).toBeNull();
  const workspace=createWorkspace(profile());workspace.profile.photo='data:image/svg+xml;base64,PHN2Zz4=';
  expect(readWorkspace({getItem:()=>JSON.stringify(workspace)})).toBeNull();
  workspace.profile.photo=null;workspace.orders[0].totalMinor=1;
  expect(readWorkspace({getItem:()=>JSON.stringify(workspace)})).toBeNull();
 });
 it('remains usable in memory when browser storage is unavailable',()=>{
  const workspace=createWorkspace(profile());
  expect(writeWorkspace({setItem:()=>{throw new Error('blocked');}},workspace)).toBe(false);
  expect(readWorkspace({getItem:()=>{throw new Error('blocked');}})).toBeNull();
 });
});
