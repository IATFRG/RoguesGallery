import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, getIdToken
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const RANKS=["Gang Leader","Sub Leader","Enforcer","Shooter","Soldier","Runner","Associate"];
const GANGS=["Sixx Gang","Unruly Gang","7Seven Gang","Alien Gang","1800 Gang","Muslim City/9 Gang","Rasta City Gang"];
let profiles=[];
let currentUser=null;
let account=null;
let allUsers=[];

const $=id=>document.getElementById(id);
const esc=v=>{const d=document.createElement("div");d.textContent=v??"";return d.innerHTML};
const rankIndex=r=>{const i=RANKS.indexOf(r);return i<0?999:i};
const formatDate=v=>v?new Date(v+"T00:00:00").toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"}):"";
const isAdmin=()=>account?.role==="admin";
const canEdit=p=>isAdmin()||p.createdBy===currentUser?.uid||(p.authorizedEditorIds||[]).includes(currentUser?.uid);

function nav(){
  const c=$("gangNavigation"); if(!c)return;
  const current=new URLSearchParams(location.search).get("gang");
  c.innerHTML=GANGS.map(g=>`<a class="nav-item gang-link ${current===g?"active":""}" href="group.html?gang=${encodeURIComponent(g)}">${esc(g)}</a>`).join("");
}

function card(p){
  const img=p.photo?`<img class="profile-image" src="${p.photo}" alt="Photo of ${esc(p.fullName)}">`:`<div class="profile-image" aria-label="No profile photo"></div>`;
  const actions=[];
  if(canEdit(p)) actions.push(`<button class="primary-button edit-profile" data-id="${p.id}" type="button">✎ Edit</button>`);
  if(isAdmin()) actions.push(`<button class="danger-button delete-profile" data-id="${p.id}" type="button">🗑 Delete</button>`);
  const audit=p.createdByName?`<p class="audit">Created by: ${esc(p.createdByName||"")}</p>`:"";
  return `<article class="profile-card"><div class="card-top">${img}<span class="rank-badge">${esc(p.rank)}</span></div><h3>${esc(p.fullName)}</h3><p>▣ D.O.B: ${esc(formatDate(p.dob))}</p><p>♙ Rank: ${esc(p.rank)}</p><p>♛ Gang: ${esc(p.gang)}</p>${audit}${actions.length?`<div class="card-actions">${actions.join("")}</div>`:""}</article>`;
}
function bindCards(){
  document.querySelectorAll(".edit-profile").forEach(b=>b.onclick=()=>editProfile(b.dataset.id));
  document.querySelectorAll(".delete-profile").forEach(b=>b.onclick=()=>deleteProfile(b.dataset.id));
}
function sorted(list,sort="rank"){
  const a=[...list];
  if(sort==="name")return a.sort((x,y)=>x.fullName.localeCompare(y.fullName));
  if(sort==="newest")return a.sort((x,y)=>(y.createdAtMs||0)-(x.createdAtMs||0));
  return a.sort((x,y)=>rankIndex(x.rank)-rankIndex(y.rank)||x.fullName.localeCompare(y.fullName));
}

async function loadAccount(){
  const snap=await getDoc(doc(db,"users",currentUser.uid));
  if(!snap.exists()) throw new Error("Your account profile is missing. Please contact an administrator.");
  account={uid:currentUser.uid,...snap.data()};
}
async function loadProfiles(){
  const snap=await getDocs(collection(db,"profiles"));
  profiles=snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function loadUsers(){
  if(!isAdmin()) return;
  const snap=await getDocs(collection(db,"users"));
  allUsers=snap.docs.map(d=>({uid:d.id,...d.data()})).sort((a,b)=>(a.officerName||"").localeCompare(b.officerName||""));
}

function renderDashboard(){
  const c=$("profiles"); if(!c)return;
  const search=$("searchInput")?.value.toLowerCase()||"";
  const filter=$("filterRank")?.value||"";
  const sort=$("sortSelect")?.value||"rank";
  const list=sorted(profiles.filter(p=>p.fullName.toLowerCase().includes(search)&&(!filter||p.rank===filter)),sort);
  c.innerHTML=list.map(card).join("");
  $("emptyMessage").hidden=list.length>0;
  bindCards();
}
function renderGroup(){
  const title=$("gangTitle"); if(!title)return;
  const gang=new URLSearchParams(location.search).get("gang")||GANGS[0];
  title.textContent=gang;
  const list=sorted(profiles.filter(p=>p.gang===gang));
  $("profiles").innerHTML=list.map(card).join("");
  $("emptyMessage").hidden=list.length>0;
  bindCards();
}

function renderAccount(){
  const label=$("accountName"); if(label)label.textContent=account?.officerName||currentUser?.email||"Account";
  const role=$("accountRole"); if(role)role.textContent=(account?.role||"user").toUpperCase();
}
function renderAuthorizedEditors(selected=[]){
  const box=$("editorAssignments"); if(!box)return;
  const wrapper=$("authorizedEditorsGroup");
  if(!isAdmin()){if(wrapper)wrapper.hidden=true;return;}
  if(wrapper)wrapper.hidden=false;
  const editors=allUsers.filter(u=>u.role==="editor");
  box.innerHTML=editors.length?editors.map(u=>`<label class="editor-option"><input type="checkbox" value="${u.uid}" ${selected.includes(u.uid)?"checked":""}> <span>${esc(u.officerName||u.email||u.uid)}</span></label>`).join(""):`<p class="muted">No Editor accounts exist yet. Promote a user to Editor in Administrator Controls first.</p>`;
}
function renderAdminPanel(){
  const panel=$("adminPanel"); if(!panel)return;
  panel.hidden=!isAdmin();
  if(!isAdmin())return;
  const rows=$("userManagementRows");
  rows.innerHTML=allUsers.map(u=>`<tr><td>${esc(u.officerName||"")}</td><td>${esc(u.email||"")}</td><td><select class="role-select" data-uid="${u.uid}"><option value="user" ${u.role==="user"?"selected":""}>User</option><option value="editor" ${u.role==="editor"?"selected":""}>Editor</option><option value="admin" ${u.role==="admin"?"selected":""}>Administrator</option></select></td><td><button class="secondary-button save-role" data-uid="${u.uid}" type="button">Save</button></td></tr>`).join("");
  document.querySelectorAll(".save-role").forEach(btn=>btn.onclick=async()=>{
    const uid=btn.dataset.uid;
    const role=document.querySelector(`.role-select[data-uid="${uid}"]`).value;
    try{
      const u=allUsers.find(x=>x.uid===uid);
      await setDoc(doc(db,"users",uid),{role,updatedAt:serverTimestamp(),updatedAtMs:Date.now()},{merge:true});
      u.role=role;
      renderAdminPanel();
      renderAuthorizedEditors([]);
    }catch(e){alert(e.message||"Could not update role.")}
  });
}

function resetForm(){
  const f=$("profileForm"); if(f)f.reset();
  if($("editingId"))$("editingId").value="";
  if($("formTitle"))$("formTitle").textContent="Add Profile";
  if($("saveButton"))$("saveButton").textContent="Save Profile";
  renderAuthorizedEditors([]);
}
function editProfile(id){
  const p=profiles.find(x=>x.id===id);
  if(!p||!canEdit(p))return;
  if(!$("profileFormPanel")){location.href="index.html";return}
  $("editingId").value=p.id;
  $("fullName").value=p.fullName||"";
  $("dob").value=p.dob||"";
  $("rank").value=p.rank||"";
  $("gang").value=p.gang||"";
  $("formTitle").textContent="Edit Profile";
  $("saveButton").textContent="Update Profile";
  renderAuthorizedEditors(p.authorizedEditorIds||[]);
  $("profileFormPanel").hidden=false;
  $("profileFormPanel").scrollIntoView({behavior:"smooth"});
}
async function deleteProfile(id){
  if(!isAdmin())return;
  const p=profiles.find(x=>x.id===id);
  if(!p||!confirm(`Delete ${p.fullName}? This cannot be undone.`))return;
  try{await deleteDoc(doc(db,"profiles",id));profiles=profiles.filter(x=>x.id!==id);renderDashboard();renderGroup()}catch(e){alert(e.message)}
}

function compressImage(file){return new Promise((resolve,reject)=>{
  if(!file.type.startsWith("image/"))return reject(new Error("Please choose an image file."));
  const reader=new FileReader(); reader.onerror=()=>reject(new Error("Could not read image."));
  reader.onload=()=>{const img=new Image();img.onerror=()=>reject(new Error("Could not process image."));img.onload=()=>{
    const max=512;let w=img.width,h=img.height;
    if(w>h&&w>max){h=Math.round(h*max/w);w=max}else if(h>=w&&h>max){w=Math.round(w*max/h);h=max}
    const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;canvas.getContext("2d").drawImage(img,0,0,w,h);
    let q=.82,data=canvas.toDataURL("image/jpeg",q);
    while(data.length>350000&&q>.35){q-=.08;data=canvas.toDataURL("image/jpeg",q)}
    if(data.length>350000)return reject(new Error("This image is still too large after compression. Please choose a smaller photo."));
    resolve(data);
  };img.src=reader.result};reader.readAsDataURL(file);
})}

function setupDashboard(){
  const form=$("profileForm"); if(!form)return;
  $("showAddProfile").onclick=()=>{resetForm();$("profileFormPanel").hidden=false;$("profileFormPanel").scrollIntoView({behavior:"smooth"})};
  $("closeFormButton").onclick=()=>$("profileFormPanel").hidden=true;
  $("cancelEditButton").onclick=resetForm;
  form.onsubmit=async e=>{
    e.preventDefault();
    const id=$("editingId").value||crypto.randomUUID();
    const old=profiles.find(x=>x.id===id);
    if(old&&!canEdit(old))return;
    let photo=old?.photo||"";
    const file=$("photo").files[0]; const status=$("status");
    try{
      status.textContent="Saving profile...";status.className="";
      if(file)photo=await compressImage(file);
      const authorizedEditorIds=isAdmin()?Array.from(document.querySelectorAll("#editorAssignments input:checked")).map(x=>x.value):(old?.authorizedEditorIds||[]);
      const p={
        fullName:$("fullName").value.trim(),dob:$("dob").value,rank:$("rank").value,gang:$("gang").value,photo,
        createdBy:old?.createdBy||currentUser.uid,
        createdByName:old?.createdByName||account.officerName,
        authorizedEditorIds,
        createdAtMs:old?.createdAtMs||Date.now(),
        updatedBy:currentUser.uid,updatedByName:account.officerName,
        updatedAtMs:Date.now(),updatedAt:serverTimestamp()
      };
      await setDoc(doc(db,"profiles",id),p,{merge:true});
      const saved={id,...p}; const i=profiles.findIndex(x=>x.id===id);
      if(i>=0)profiles[i]=saved;else profiles.push(saved);
      status.textContent=i>=0?"Profile updated successfully.":"Profile added successfully.";status.className="success";
      resetForm();renderDashboard();
    }catch(err){status.textContent=err.message||"Could not save profile.";status.className="error"}
  };
  ["searchInput","filterRank","sortSelect"].forEach(id=>$(id)?.addEventListener("input",renderDashboard));
  $("filterRank")?.addEventListener("change",renderDashboard);$("sortSelect")?.addEventListener("change",renderDashboard);
  $("exportButton").onclick=()=>{const blob=new Blob([JSON.stringify(profiles,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="rogue-gallery-backup.json";a.click();URL.revokeObjectURL(a.href)};
  $("importInput").onchange=async e=>{const status=$("backupStatus");try{const data=JSON.parse(await e.target.files[0].text());if(!Array.isArray(data))throw new Error("Invalid backup file.");for(const p of data){const id=p.id||crypto.randomUUID();await setDoc(doc(db,"profiles",id),{fullName:p.fullName||"",dob:p.dob||"",rank:p.rank||"Associate",gang:p.gang||GANGS[0],photo:p.photo||"",createdBy:currentUser.uid,createdByName:account.officerName,authorizedEditorIds:[],createdAtMs:p.createdAtMs||Date.now(),updatedBy:currentUser.uid,updatedByName:account.officerName,updatedAtMs:Date.now(),updatedAt:serverTimestamp()},{merge:true})}await loadProfiles();renderDashboard();status.textContent="Backup imported successfully.";status.className="success"}catch(err){status.textContent=err.message||"Could not import this backup.";status.className="error"}finally{e.target.value=""}};
  $("logoutButton").onclick=async()=>{await signOut(auth);location.href="login.html"};
}

function setupLogin(){const f=$("loginForm");if(!f)return;f.onsubmit=async e=>{e.preventDefault();const status=$("loginStatus");try{await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value);status.textContent="Signed in successfully.";status.className="success"}catch(err){status.textContent=err.message.replace("Firebase: ","");status.className="error"}}}
async function requestAdminPromotion(user, adminCode){
  if(!adminCode) return false;
  const endpoint=window.ADMIN_SETUP_ENDPOINT;
  if(!endpoint) throw new Error("Administrator setup service has not been configured yet.");
  const idToken=await getIdToken(user,true);
  const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken,adminCode})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||"Administrator setup code was not accepted.");
  return true;
}
function setupRegister(){const f=$("registerForm");if(!f)return;f.onsubmit=async e=>{e.preventDefault();const status=$("registerStatus");const officerName=$("officerName").value.trim(),email=$("email").value.trim(),password=$("password").value,confirmPassword=$("confirmPassword").value,adminCode=$("adminCode")?.value||"";if(password!==confirmPassword){status.textContent="Passwords do not match.";status.className="error";return}try{status.textContent="Creating account...";status.className="";const cred=await createUserWithEmailAndPassword(auth,email,password);await setDoc(doc(db,"users",cred.user.uid),{officerName,email,role:"user",createdAtMs:Date.now(),updatedAtMs:Date.now(),createdAt:serverTimestamp(),updatedAt:serverTimestamp()});if(adminCode.trim()){status.textContent="Verifying administrator setup code...";const promoted=await requestAdminPromotion(cred.user,adminCode.trim());status.textContent=promoted?"Administrator account created successfully.":"Account created successfully.";}else status.textContent="Account created successfully.";status.className="success"}catch(err){status.textContent=err.message.replace("Firebase: ","");status.className="error"}}}

async function boot(){
  nav();setupLogin();setupRegister();setupDashboard();
  onAuthStateChanged(auth,async user=>{
    const protectedPage=!location.pathname.endsWith("login.html")&&!location.pathname.endsWith("register.html");
    if(user){
      currentUser=user;
      if(location.pathname.endsWith("login.html")||location.pathname.endsWith("register.html")){location.href="index.html";return}
      try{await loadAccount();await loadProfiles();await loadUsers();renderAccount();renderAdminPanel();renderAuthorizedEditors([]);renderDashboard();renderGroup()}catch(e){const msg=$("status")||$("backupStatus");if(msg){msg.textContent="Could not load directory data: "+e.message;msg.className="error"}else alert(e.message)}
    }else if(protectedPage){location.href="login.html"}
  });
}
document.addEventListener("DOMContentLoaded",boot);
