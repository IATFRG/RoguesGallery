import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  collection, doc, getDocs, setDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const RANKS=["Gang Leader","Sub Leader","Enforcer","Shooter","Soldier","Runner","Associate"];
const GANGS=["Sixx Gang","Unruly Gang","7Seven Gang","Alien Gang","1800 Gang","Muslim City/9 Gang","Rasta City Gang"];
let profiles=[];
let currentUser=null;

const $=id=>document.getElementById(id);
const rankIndex=r=>{const i=RANKS.indexOf(r);return i<0?999:i};
const esc=v=>{const d=document.createElement("div");d.textContent=v??"";return d.innerHTML};
const formatDate=v=>v?new Date(v+"T00:00:00").toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"}):"";
const profileCollection=()=>collection(db,"users",currentUser.uid,"profiles");

function nav(){const c=$("gangNavigation");if(!c)return;const current=new URLSearchParams(location.search).get("gang");c.innerHTML=GANGS.map(g=>`<a class="nav-item gang-link ${current===g?"active":""}" href="group.html?gang=${encodeURIComponent(g)}">${esc(g)}</a>`).join("")}

function card(p){
 const img=p.photo?`<img class="profile-image" src="${p.photo}" alt="Photo of ${esc(p.fullName)}">`:`<div class="profile-image" aria-label="No profile photo"></div>`;
 return `<article class="profile-card"><div class="card-top">${img}<span class="rank-badge">${esc(p.rank)}</span></div><h3>${esc(p.fullName)}</h3><p>▣ D.O.B: ${esc(formatDate(p.dob))}</p><p>♙ Rank: ${esc(p.rank)}</p><p>♛ Gang: ${esc(p.gang)}</p><div class="card-actions"><button class="primary-button edit-profile" data-id="${p.id}" type="button">✎ Edit</button><button class="danger-button delete-profile" data-id="${p.id}" type="button">🗑 Delete</button></div></article>`;
}
function bindCards(){document.querySelectorAll(".edit-profile").forEach(b=>b.onclick=()=>editProfile(b.dataset.id));document.querySelectorAll(".delete-profile").forEach(b=>b.onclick=()=>deleteProfile(b.dataset.id))}
function sorted(list,sort="rank"){const a=[...list];if(sort==="name")return a.sort((x,y)=>x.fullName.localeCompare(y.fullName));if(sort==="newest")return a.sort((x,y)=>(y.createdAtMs||0)-(x.createdAtMs||0));return a.sort((x,y)=>rankIndex(x.rank)-rankIndex(y.rank)||x.fullName.localeCompare(y.fullName))}

async function loadProfiles(){if(!currentUser)return;const snap=await getDocs(profileCollection());profiles=snap.docs.map(d=>({id:d.id,...d.data()}));}
function renderDashboard(){const c=$("profiles");if(!c)return;const search=$("searchInput")?.value.toLowerCase()||"";const filter=$("filterRank")?.value||"";const sort=$("sortSelect")?.value||"rank";const list=sorted(profiles.filter(p=>p.fullName.toLowerCase().includes(search)&&(!filter||p.rank===filter)),sort);c.innerHTML=list.map(card).join("");$("emptyMessage").hidden=list.length>0;bindCards()}
function renderGroup(){const title=$("gangTitle");if(!title)return;const gang=new URLSearchParams(location.search).get("gang")||GANGS[0];title.textContent=gang;const list=sorted(profiles.filter(p=>p.gang===gang));$("profiles").innerHTML=list.map(card).join("");$("emptyMessage").hidden=list.length>0;bindCards()}

function resetForm(){const f=$("profileForm");if(f)f.reset();if($("editingId"))$("editingId").value="";if($("formTitle"))$("formTitle").textContent="Add Profile";if($("saveButton"))$("saveButton").textContent="Save Profile";}
function editProfile(id){const p=profiles.find(x=>x.id===id);if(!p)return;if(!$("profileFormPanel")){location.href="index.html";return}$("editingId").value=p.id;$("fullName").value=p.fullName||"";$("dob").value=p.dob||"";$("rank").value=p.rank||"";$("gang").value=p.gang||"";$("formTitle").textContent="Edit Profile";$("saveButton").textContent="Update Profile";$("profileFormPanel").hidden=false;$("profileFormPanel").scrollIntoView({behavior:"smooth"})}
async function deleteProfile(id){const p=profiles.find(x=>x.id===id);if(!p||!confirm(`Delete ${p.fullName}? This cannot be undone.`))return;try{await deleteDoc(doc(db,"users",currentUser.uid,"profiles",id));profiles=profiles.filter(x=>x.id!==id);renderDashboard();renderGroup()}catch(e){alert(e.message)}}

function compressImage(file){return new Promise((resolve,reject)=>{if(!file.type.startsWith("image/"))return reject(new Error("Please choose an image file."));const reader=new FileReader();reader.onerror=()=>reject(new Error("Could not read image."));reader.onload=()=>{const img=new Image();img.onerror=()=>reject(new Error("Could not process image."));img.onload=()=>{const max=512;let w=img.width,h=img.height;if(w>h&&w>max){h=Math.round(h*max/w);w=max}else if(h>=w&&h>max){w=Math.round(w*max/h);h=max}const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0,w,h);let q=.82,data=canvas.toDataURL("image/jpeg",q);while(data.length>350000&&q>.35){q-=.08;data=canvas.toDataURL("image/jpeg",q)}if(data.length>350000)return reject(new Error("This image is still too large after compression. Please choose a smaller photo."));resolve(data)};img.src=reader.result};reader.readAsDataURL(file)})}

function setupDashboard(){const form=$("profileForm");if(!form)return;$("showAddProfile").onclick=()=>{resetForm();$("profileFormPanel").hidden=false;$("profileFormPanel").scrollIntoView({behavior:"smooth"})};$("closeFormButton").onclick=()=>$("profileFormPanel").hidden=true;$("cancelEditButton").onclick=resetForm;
 form.onsubmit=async e=>{e.preventDefault();const id=$("editingId").value||crypto.randomUUID();const old=profiles.find(x=>x.id===id);let photo=old?.photo||"";const file=$("photo").files[0];const status=$("status");try{status.textContent="Saving profile...";status.className="";if(file)photo=await compressImage(file);const p={fullName:$("fullName").value.trim(),dob:$("dob").value,rank:$("rank").value,gang:$("gang").value,photo,createdAtMs:old?.createdAtMs||Date.now(),updatedAt:serverTimestamp()};await setDoc(doc(db,"users",currentUser.uid,"profiles",id),p,{merge:true});const saved={id,...p};const i=profiles.findIndex(x=>x.id===id);if(i>=0)profiles[i]=saved;else profiles.push(saved);status.textContent=i>=0?"Profile updated successfully.":"Profile added successfully.";status.className="success";resetForm();renderDashboard()}catch(err){status.textContent=err.message||"Could not save profile.";status.className="error"}};
 ["searchInput","filterRank","sortSelect"].forEach(id=>$(id)?.addEventListener("input",renderDashboard));$("filterRank")?.addEventListener("change",renderDashboard);$("sortSelect")?.addEventListener("change",renderDashboard);
 $("exportButton").onclick=()=>{const blob=new Blob([JSON.stringify(profiles,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="rogue-gallery-backup.json";a.click();URL.revokeObjectURL(a.href)};
 $("importInput").onchange=async e=>{const status=$("backupStatus");try{const data=JSON.parse(await e.target.files[0].text());if(!Array.isArray(data))throw new Error("Invalid backup file.");for(const p of data){const id=p.id||crypto.randomUUID();await setDoc(doc(db,"users",currentUser.uid,"profiles",id),{fullName:p.fullName||"",dob:p.dob||"",rank:p.rank||"Associate",gang:p.gang||GANGS[0],photo:p.photo||"",createdAtMs:p.createdAtMs||Date.now(),updatedAt:serverTimestamp()},{merge:true})}await loadProfiles();renderDashboard();status.textContent="Backup imported successfully.";status.className="success"}catch(err){status.textContent=err.message||"Could not import this backup.";status.className="error"}finally{e.target.value=""}};
 $("logoutButton").onclick=async()=>{await signOut(auth);location.href="login.html"};
}

function setupLogin(){const f=$("loginForm");if(!f)return;f.onsubmit=async e=>{e.preventDefault();const status=$("loginStatus");try{await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value);status.textContent="Signed in successfully.";status.className="success"}catch(err){status.textContent=err.message.replace("Firebase: ","");status.className="error"}}}
function setupRegister(){const f=$("registerForm");if(!f)return;f.onsubmit=async e=>{e.preventDefault();const status=$("registerStatus");const email=$("email").value.trim(),password=$("password").value,confirmPassword=$("confirmPassword").value;if(password!==confirmPassword){status.textContent="Passwords do not match.";status.className="error";return}try{await createUserWithEmailAndPassword(auth,email,password);status.textContent="Account created successfully.";status.className="success"}catch(err){status.textContent=err.message.replace("Firebase: ","");status.className="error"}}}

async function boot(){nav();setupLogin();setupRegister();setupDashboard();onAuthStateChanged(auth,async user=>{const isPrivate=["index.html","group.html",""].some(x=>location.pathname.endsWith(x));if(user){currentUser=user;if(location.pathname.endsWith("login.html")||location.pathname.endsWith("register.html")){location.href="index.html";return}try{await loadProfiles();renderDashboard();renderGroup()}catch(e){const msg=$("status")||$("backupStatus");if(msg){msg.textContent="Could not load cloud profiles: "+e.message;msg.className="error"}}}else if(isPrivate&&!location.pathname.endsWith("login.html")&&!location.pathname.endsWith("register.html")){location.href="login.html"}})}
document.addEventListener("DOMContentLoaded",boot);
