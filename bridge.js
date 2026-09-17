'use strict';
/*
 * Browser bridge for the Rogues Gallery GitHub Pages client. The Supabase
 * publishable key is public configuration; every record operation is enforced
 * by the server-side authenticated RPCs.
 */
(() => {
  const base='https://gjygzojrjurenuhrobes.supabase.co';
  const key='sb_publishable_qKN45lGN8IXX6ct7fj2ksw_2m_L1O7d';
  let token=null, expiresAt=0, pending=null, lastActive=0;
  const locks=new Set();
  const lock=reason => { token=null; expiresAt=0; pending=null; locks.forEach(fn=>fn(reason)); };
  const active=() => {
    if (!token || Date.now() >= expiresAt || Date.now()-lastActive >= 300000) {
      lock('Your session has locked. Sign in again.');
      throw Object.assign(Error('Sign in again.'),{status:401});
    }
    lastActive=Date.now();
  };
  const headers=(auth=true, extra={}) => ({
    apikey:key, ...(auth&&token?{Authorization:'Bearer '+token}:{}), ...extra
  });
  const request=async(path,{method='POST',body,auth=true,binary=false}={}) => {
    const r=await fetch(base+path,{method,headers:headers(auth,body instanceof Uint8Array?{'Content-Type':'application/octet-stream'}:{'Content-Type':'application/json'}),body:body===undefined?undefined:body instanceof Uint8Array?body:JSON.stringify(body)});
    if(binary) {
      if(!r.ok) throw Object.assign(Error('Photograph unavailable.'),{status:r.status});
      const blob=await r.blob();
      if(!['image/jpeg','image/png'].includes(blob.type)||blob.size>5242880) throw Error('Unexpected photograph format.');
      return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
    }
    const data=await r.json().catch(()=>null);
    if(!r.ok) {
      const error=Object.assign(Error(data?.message||data?.msg||data?.error_description||data?.error||'Request failed.'),{status:data?.code==='40001'?409:data?.code==='42501'?403:r.status});
      if(error.status===401) lock('Your session ended. Sign in again.');
      throw error;
    }
    return data;
  };
  const rpc=(op,payload={}) => { active(); return request('/rest/v1/rpc/iatf_api',{body:{op,payload}}); };
  const session=async accessToken => {
    const old=token; token=accessToken; lastActive=Date.now();
    try {
      const value=await request('/rest/v1/rpc/iatf_api',{body:{op:'session',payload:{}}});
      if(!value?.member?.active) throw Object.assign(Error('Account not approved.'),{status:403});
      return {session:value};
    } catch(error) { token=old; throw error; }
  };
  const login=async payload => {
    const auth=await request('/functions/v1/iatf-accounts',{auth:false,body:{op:'login',identifier:String(payload.identifier||'').trim(),password:String(payload.password||'')}});
    const factor=auth?.user?.factors?.find(f=>f.status==='verified'&&f.factor_type==='totp');
    if(factor){ pending={token:auth.access_token,factor:factor.id,until:Date.now()+180000}; return {mfa_required:true}; }
    const result=await session(auth.access_token); expiresAt=Date.now()+Number(auth.expires_in||3600)*1000; return result;
  };
  const mfa=async payload => {
    if(!pending||Date.now()>pending.until||!/^[0-9]{6}$/.test(payload.code||'')) throw Object.assign(Error('Enter a valid six-digit authenticator code.'),{status:401});
    const p=pending;
    const temporary=token; token=p.token;
    try {
      const challenge=await request('/auth/v1/factors/'+encodeURIComponent(p.factor)+'/challenge',{body:{}});
      const auth=await request('/auth/v1/factors/'+encodeURIComponent(p.factor)+'/verify',{body:{challenge_id:challenge.id,code:payload.code}});
      const result=await session(auth.access_token); expiresAt=Date.now()+Number(auth.expires_in||3600)*1000; pending=null; return result;
    } finally { if(!token) token=temporary; }
  };
  const account=async (op,payload) => request('/functions/v1/iatf-accounts',{auth:['review','admin_email'].includes(op),body:{...payload,op}});
  const uploadPhoto=async ({id,version,slot,bytes}) => {
    active();
    const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]);
    if(!data.length||data.length>5242880) throw Error('Use a PNG or JPEG photograph up to 5 MB.');
    return request('/functions/v1/iatf-photos?id='+encodeURIComponent(id)+'&version='+encodeURIComponent(version)+(slot===undefined?'':'&slot='+encodeURIComponent(slot)),{body:data});
  };
  const savePerson=async ({record,photos=[],offlineKey}) => {
    active();
    let value=await rpc(record.id?'record_save':'offline_record_create',record.id?record:{...record,offline_key:offlineKey,submission_protocol:'approval-v1'});
    try {
      for(const photo of photos) {
        const bytes=photo.bytes instanceof Uint8Array?photo.bytes:new Uint8Array(photo.bytes||[]);
        value=await rpc('record',{id:value.id});
        await uploadPhoto({id:value.id,version:value.version,bytes});
      }
      await rpc('card_submit',{id:value.id,photo_count:photos.length});
      return {record:await rpc('record',{id:value.id}),complete:true};
    } catch(error) { return {record:value,complete:false,error:error.message}; }
  };
  const exportProfile=async ({id}) => {
    const receipt=await request('/rest/v1/rpc/iatf_reliability',{body:{op:'export',payload:{id}}});
    const blob=new Blob([JSON.stringify(receipt,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='rogues-gallery-profile.json';link.click();URL.revokeObjectURL(url);
    return {saved:true};
  };
  window.iatf={
    async call(action,payload={}) {
      try {
        let data;
        if(action==='login') data=await login(payload);
        else if(action==='mfa') data=await mfa(payload);
        else if(action==='logout') { if(token) await request('/auth/v1/logout?scope=local',{body:{}}).catch(()=>{}); lock(''); data={ok:true}; }
        else if(action==='activity') { active(); data={ok:true}; }
        else if(action==='rpc') data=await rpc(payload.op,payload.payload);
        else if(action==='account') data=await account(payload.op,payload.payload);
        else if(action==='gnet') { active(); data=await request('/rest/v1/rpc/iatf_gnet',{body:{op:payload.op,payload:payload.payload}}); }
        else if(action==='reliability') { active(); data=await request('/rest/v1/rpc/iatf_reliability',{body:{op:payload.op,payload:payload.payload}}); }
        else if(action==='photo') { active(); data=await request('/functions/v1/iatf-photos?id='+encodeURIComponent(payload.id)+'&slot='+encodeURIComponent(payload.slot||0),{method:'GET',body:undefined,binary:true}); }
        else if(action==='uploadPhoto') data=await uploadPhoto(payload);
        else if(action==='savePerson') data=await savePerson(payload);
        else if(action==='exportProfile') data=await exportProfile(payload);
        else if(action==='buildInfo') data={version:'Web',buildDate:'',notes:'GitHub Pages client',update:await request('/functions/v1/iatf-accounts',{auth:false,body:{op:'release_hint'}}).catch(()=>({channel:'unavailable'}))};
        else if(['cachePage','cacheStatus','cacheClear','draft'].includes(action)) data=action==='cacheStatus'?{available:false,message:'Downloaded-card storage is available only in the native app.'}:null;
        else throw Error('Unsupported browser action.');
        return {ok:true,data};
      } catch(error) { return {ok:false,error:error.message||'Request failed.',status:error.status||500,creationMayExist:error.creationMayExist}; }
    },
    onLock(callback){locks.add(callback);return()=>locks.delete(callback);}
  };
  document.addEventListener('pointerdown',()=>{if(token)lastActive=Date.now();},{passive:true});
  document.addEventListener('keydown',()=>{if(token)lastActive=Date.now();});
})();
