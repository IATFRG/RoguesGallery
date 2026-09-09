import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, deleteUser
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, writeBatch, deleteField
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const RANKS=["Gang Leader","Sub Leader","Enforcer","Shooter","Soldier","Runner","Associate"];
const GANGS=["Sixx Gang","Unruly Gang","7Seven Gang","Alien Gang","1800 Gang","Muslim City/9 Gang","Rasta City Gang"];
let profiles=[];
let currentUser=null;
let currentAccount=null;
let directoryUsers=[];
let managingProfileId=null;

const $=id=>document.getElementById(id);
const rankIndex=r=>{const i=RANKS.indexOf(r);return i<0?999:i};
const esc=v=>{const d=document.createElement("div");d.textContent=v??"";return d.innerHTML};
const formatDate=v=>v?new Date(v+"T00:00:00").toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"}):"";
const profileCollection=()=>collection(db,"profiles");
const canEdit=p=>currentAccount&&(currentAccount.role==="admin"||p.createdByUid===currentUser.uid||(p.editorIds||[]).includes(currentUser.uid));
const isAdmin=()=>currentAccount?.role==="admin";

function nav(){const c=$("gangNavigation");if(!c)return;const current=new URLSearchParams(location.search).get("gang");c.innerHTML=GANGS.map(g=>`<a class="nav-item gang-link ${current===g?"active":""}" href="group.html?gang=${encodeURIComponent(g)}">${esc(g)}</a>`).join("")}
function renderAccount(){if($("officerDisplay"))$("officerDisplay").textContent=currentAccount?.officerName||currentUser?.email||"";if($("roleDisplay"))$("roleDisplay").textContent=(currentAccount?.role||"user").toUpperCase()}

function card(p){
 const img=p.photo?`<img class="profile-image" src="${p.photo}" alt="Photo of ${esc(p.fullName)}">`:`<div class="profile-image" aria-label="No profile photo"></div>`;
 const actions=[];
 if(canEdit(p)) actions.push(`<button class="primary-button edit-profile" data-id="${p.id}" type="button">✎ Edit</button>`);
 if(isAdmin()) actions.push(`<button class="secondary-button editors-profile" data-id="${p.id}" type="button">Permissions</button><button class="danger-button delete-profile" data-id="${p.id}" type="button">🗑 Delete</button>`);
 const audit=p.createdByOfficerName?`<p class="audit-line">Added by ${esc(p.createdByOfficerName)}${p.lastEditedByOfficerName?` · Edited by ${esc(p.lastEditedByOfficerName)}`:""}</p>`:"";
 return `<article class="profile-card"><div class="card-top">${img}<span class="rank-badge">${esc(p.rank)}</span></div><h3>${esc(p.fullName)}</h3><p>▣ D.O.B: ${esc(formatDate(p.dob))}</p><p>♙ Rank: ${esc(p.rank)}</p><p>♛ Gang: ${esc(p.gang)}</p>${audit}${actions.length?`<div class="card-actions">${actions.join("")}</div>`:""}</article>`;
}
function bindCards(){
 document.querySelectorAll(".edit-profile").forEach(b=>b.onclick=()=>editProfile(b.dataset.id));
 document.querySelectorAll(".delete-profile").forEach(b=>b.onclick=()=>deleteProfile(b.dataset.id));
 document.querySelectorAll(".editors-profile").forEach(b=>b.onclick=()=>openEditorPermissions(b.dataset.id));
}
function sorted(list,sort="rank"){const a=[...list];if(sort==="name")return a.sort((x,y)=>x.fullName.localeCompare(y.fullName));if(sort==="newest")return a.sort((x,y)=>(y.createdAtMs||0)-(x.createdAtMs||0));return a.sort((x,y)=>rankIndex(x.rank)-rankIndex(y.rank)||x.fullName.localeCompare(y.fullName))}

async function loadAccount(){const snap=await getDoc(doc(db,"users",currentUser.uid));if(!snap.exists())throw new Error("Your directory account profile could not be found.");currentAccount=snap.data();renderAccount()}
async function loadProfiles(){const snap=await getDocs(profileCollection());profiles=snap.docs.map(d=>({id:d.id,...d.data()}));}
async function loadUsers(){if(!isAdmin())return;const snap=await getDocs(collection(db,"users"));directoryUsers=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.officerName||"").localeCompare(b.officerName||""));}

function renderDashboard(){const c=$("profiles");if(!c)return;const search=$("searchInput")?.value.toLowerCase()||"";const filter=$("filterRank")?.value||"";const sort=$("sortSelect")?.value||"rank";const list=sorted(profiles.filter(p=>p.fullName.toLowerCase().includes(search)&&(!filter||p.rank===filter)),sort);c.innerHTML=list.map(card).join("");$("emptyMessage").hidden=list.length>0;bindCards()}
function renderGroup(){const title=$("gangTitle");if(!title)return;const gang=new URLSearchParams(location.search).get("gang")||GANGS[0];title.textContent=gang;const list=sorted(profiles.filter(p=>p.gang===gang));$("profiles").innerHTML=list.map(card).join("");$("emptyMessage").hidden=list.length>0;bindCards()}

function resetForm(){const f=$("profileForm");if(f)f.reset();if($("editingId"))$("editingId").value="";if($("formTitle"))$("formTitle").textContent="Add Profile";if($("saveButton"))$("saveButton").textContent="Save Profile";}
function editProfile(id){const p=profiles.find(x=>x.id===id);if(!p||!canEdit(p))return;if(!$("profileFormPanel")){location.href="index.html";return}$("editingId").value=p.id;$("fullName").value=p.fullName||"";$("dob").value=p.dob||"";$("rank").value=p.rank||"";$("gang").value=p.gang||"";$("formTitle").textContent="Edit Profile";$("saveButton").textContent="Update Profile";$("profileFormPanel").hidden=false;$("profileFormPanel").scrollIntoView({behavior:"smooth"})}
async function deleteProfile(id){const p=profiles.find(x=>x.id===id);if(!p||!isAdmin()||!confirm(`Delete ${p.fullName}? This cannot be undone.`))return;try{await deleteDoc(doc(db,"profiles",id));profiles=profiles.filter(x=>x.id!==id);renderDashboard();renderGroup()}catch(e){alert(e.message)}}

function compressImage(file){return new Promise((resolve,reject)=>{if(!file.type.startsWith("image/"))return reject(new Error("Please choose an image file."));const reader=new FileReader();reader.onerror=()=>reject(new Error("Could not read image."));reader.onload=()=>{const img=new Image();img.onerror=()=>reject(new Error("Could not process image."));img.onload=()=>{const max=512;let w=img.width,h=img.height;if(w>h&&w>max){h=Math.round(h*max/w);w=max}else if(h>=w&&h>max){w=Math.round(w*max/h);h=max}const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;canvas.getContext("2d").drawImage(img,0,0,w,h);let q=.82,data=canvas.toDataURL("image/jpeg",q);while(data.length>350000&&q>.35){q-=.08;data=canvas.toDataURL("image/jpeg",q)}if(data.length>350000)return reject(new Error("This image is still too large after compression. Please choose a smaller photo."));resolve(data)};img.src=reader.result};reader.readAsDataURL(file)})}

async function openEditorPermissions(id){
 if(!isAdmin())return;managingProfileId=id;const p=profiles.find(x=>x.id===id);if(!p)return;await loadUsers();$("editorProfileName").textContent=`Choose which Editors may edit ${p.fullName}.`;
 const editors=directoryUsers.filter(u=>u.role==="editor");
 $("editorList").innerHTML=editors.length?editors.map(u=>`<label class="editor-row"><input type="checkbox" value="${u.id}" ${(p.editorIds||[]).includes(u.id)?"checked":""}><span><strong>${esc(u.officerName||u.email)}</strong><small>${esc(u.email||"")}</small></span></label>`).join(""):`<p class="panel-copy">There are no accounts with the Editor role yet. Use Manage Users first.</p>`;
 $("editorPanel").hidden=false;$("editorPanel").scrollIntoView({behavior:"smooth"});
}
async function saveEditorPermissions(){
 if(!isAdmin()||!managingProfileId)return;const status=$("editorsStatus");try{const editorIds=[...document.querySelectorAll("#editorList input:checked")].map(i=>i.value);await updateDoc(doc(db,"profiles",managingProfileId),{editorIds,lastEditedByUid:currentUser.uid,lastEditedByOfficerName:currentAccount.officerName,lastEditedAt:serverTimestamp()});const p=profiles.find(x=>x.id===managingProfileId);if(p)p.editorIds=editorIds;status.textContent="Editor permissions saved.";status.className="success";renderDashboard();renderGroup()}catch(e){status.textContent=e.message||"Could not save permissions.";status.className="error"}}

async function renderUsers(){if(!isAdmin()||!$("usersList"))return;await loadUsers();$("usersList").innerHTML=directoryUsers.map(u=>`<div class="user-row"><div><strong>${esc(u.officerName||"Unnamed Officer")}</strong><small>${esc(u.email||"")}</small></div><select class="role-select" data-id="${u.id}"><option value="user" ${u.role==="user"?"selected":""}>User</option><option value="editor" ${u.role==="editor"?"selected":""}>Editor</option><option value="admin" ${u.role==="admin"?"selected":""}>Administrator</option></select></div>`).join("");document.querySelectorAll(".role-select").forEach(s=>s.onchange=()=>changeRole(s.dataset.id,s.value));}
async function changeRole(uid,roleValue){const status=$("usersStatus");try{await updateDoc(doc(db,"users",uid),{role:roleValue,adminSetupCode:deleteField()});const u=directoryUsers.find(x=>x.id===uid);if(u)u.role=roleValue;status.textContent="User role updated.";status.className="success";if(uid===currentUser.uid){currentAccount.role=roleValue;renderAccount()}}catch(e){status.textContent=e.message||"Could not update role.";status.className="error"}}

function setupLogout(){const b=$("logoutButton");if(b)b.onclick=async()=>{await signOut(auth);location.href="login.html"};}

function setupDashboard(){
 const form=$("profileForm");if(!form)return;
 $("showAddProfile").onclick=()=>{resetForm();$("profileFormPanel").hidden=false;$("profileFormPanel").scrollIntoView({behavior:"smooth"})};$("closeFormButton").onclick=()=>$("profileFormPanel").hidden=true;$("cancelEditButton").onclick=resetForm;
 $("showUsersButton")?.addEventListener("click",async()=>{await renderUsers();$("userManagementPanel").hidden=false;$("userManagementPanel").scrollIntoView({behavior:"smooth"})});$("closeUsersButton")?.addEventListener("click",()=>$("userManagementPanel").hidden=true);$("closeEditorsButton")?.addEventListener("click",()=>$("editorPanel").hidden=true);$("saveEditorsButton")?.addEventListener("click",saveEditorPermissions);
 form.onsubmit=async e=>{e.preventDefault();const id=$("editingId").value||crypto.randomUUID();const old=profiles.find(x=>x.id===id);if(old&&!canEdit(old))return;let photo=old?.photo||"";const file=$("photo").files[0];const status=$("status");try{status.textContent="Saving profile...";status.className="";if(file)photo=await compressImage(file);const p={fullName:$("fullName").value.trim(),dob:$("dob").value,rank:$("rank").value,gang:$("gang").value,photo,createdAtMs:old?.createdAtMs||Date.now(),createdByUid:old?.createdByUid||currentUser.uid,createdByOfficerName:old?.createdByOfficerName||currentAccount.officerName,editorIds:old?.editorIds||[],lastEditedByUid:currentUser.uid,lastEditedByOfficerName:currentAccount.officerName,lastEditedAt:serverTimestamp()};await setDoc(doc(db,"profiles",id),p,{merge:true});const saved={id,...p};const i=profiles.findIndex(x=>x.id===id);if(i>=0)profiles[i]=saved;else profiles.push(saved);status.textContent=i>=0?"Profile updated successfully.":"Profile added successfully.";status.className="success";resetForm();renderDashboard()}catch(err){status.textContent=err.message||"Could not save profile.";status.className="error"}};
 ["searchInput","filterRank","sortSelect"].forEach(id=>$(id)?.addEventListener("input",renderDashboard));$("filterRank")?.addEventListener("change",renderDashboard);$("sortSelect")?.addEventListener("change",renderDashboard);
 $("exportButton").onclick=()=>{const blob=new Blob([JSON.stringify(profiles,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="rogue-gallery-backup.json";a.click();URL.revokeObjectURL(a.href)};
 $("importInput").onchange=async e=>{const status=$("backupStatus");try{const data=JSON.parse(await e.target.files[0].text());if(!Array.isArray(data))throw new Error("Invalid backup file.");for(const raw of data){const id=crypto.randomUUID();const p={fullName:raw.fullName||"",dob:raw.dob||"",rank:raw.rank||"Associate",gang:raw.gang||GANGS[0],photo:raw.photo||"",createdAtMs:Date.now(),createdByUid:currentUser.uid,createdByOfficerName:currentAccount.officerName,editorIds:[],lastEditedByUid:currentUser.uid,lastEditedByOfficerName:currentAccount.officerName,lastEditedAt:serverTimestamp()};await setDoc(doc(db,"profiles",id),p)}await loadProfiles();renderDashboard();status.textContent="Backup imported successfully.";status.className="success"}catch(err){status.textContent=err.message||"Could not import this backup.";status.className="error"}finally{e.target.value=""}};
}

function setupLogin(){const f=$("loginForm");if(!f)return;f.onsubmit=async e=>{e.preventDefault();const status=$("loginStatus");try{await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value);status.textContent="Signed in successfully.";status.className="success"}catch(err){status.textContent=err.message.replace("Firebase: ","");status.className="error"}}}
function setupRegister(){const f=$("registerForm");if(!f)return;f.onsubmit=async e=>{e.preventDefault();const status=$("registerStatus");const officerName=$("officerName").value.trim(),email=$("email").value.trim(),password=$("password").value,confirmPassword=$("confirmPassword").value,code=$("adminSetupCode").value;let credential=null;if(password!==confirmPassword){status.textContent="Passwords do not match.";status.className="error";return}if(!officerName){status.textContent="Officer Name is required.";status.className="error";return}try{credential=await createUserWithEmailAndPassword(auth,email,password);const uid=credential.user.uid;const userRef=doc(db,"users",uid);if(code){const batch=writeBatch(db);batch.set(userRef,{officerName,email,role:"admin",adminSetupCode:code,createdAt:serverTimestamp()});batch.update(doc(db,"system","bootstrap"),{enabled:false});await batch.commit();await updateDoc(userRef,{adminSetupCode:deleteField()});}else{await setDoc(userRef,{officerName,email,role:"user",createdAt:serverTimestamp()});}status.textContent="Account created successfully.";status.className="success";setTimeout(()=>location.href="index.html",500)}catch(err){if(credential?.user){try{await deleteUser(credential.user)}catch(_){}}status.textContent=err.message.replace("Firebase: ","");status.className="error"}}}

async function boot(){nav();setupLogin();setupRegister();setupLogout();setupDashboard();onAuthStateChanged(auth,async user=>{const page=location.pathname.split("/").pop()||"index.html";const privatePages=["index.html","group.html",""];if(user){currentUser=user;if(page==="login.html"||page==="register.html")return;try{await loadAccount();await loadProfiles();if(isAdmin()&&$("showUsersButton"))$("showUsersButton").hidden=false;renderDashboard();renderGroup()}catch(e){const msg=$("status")||$("backupStatus")||$("registerStatus");if(msg){msg.textContent="Could not load directory account: "+e.message;msg.className="error"}}}else if(privatePages.includes(page)){location.href="login.html"}})}
document.addEventListener("DOMContentLoaded",boot);