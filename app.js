const STORAGE_KEY="profileDirectory",LOGIN_KEY="directoryLoggedIn";
const DEMO_PASSWORD="$p@rkle1989";
const roleHierarchy={"Leader":1,"Sub Leader":2,"Enforcer":3,"Shooter":4,"Soldier":5,"Runner":6,"Associate":7};

function getProfiles(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||[]}catch{return[]}}
function saveProfiles(p){localStorage.setItem(STORAGE_KEY,JSON.stringify(p))}
function isDirectoryPage(){return document.getElementById("profileForm")||document.getElementById("profiles")}

const loginForm=document.getElementById("loginForm");
if(loginForm){loginForm.addEventListener("submit",e=>{e.preventDefault();const p=document.getElementById("password").value,s=document.getElementById("loginStatus");if(p===DEMO_PASSWORD){sessionStorage.setItem(LOGIN_KEY,"true");location.href="index.html"}else{s.textContent="Incorrect password.";s.className="status error"}})}

if(isDirectoryPage()&&!loginForm&&sessionStorage.getItem(LOGIN_KEY)!=="true")location.href="login.html";
const logoutButton=document.getElementById("logoutButton");
if(logoutButton)logoutButton.addEventListener("click",()=>{sessionStorage.removeItem(LOGIN_KEY);location.href="login.html"});

function readImage(file,callback){
 const allowed=["image/jpeg","image/png","image/webp"];
 if(!allowed.includes(file.type)){alert("Please upload a JPG, PNG, or WebP image.");return}
 const reader=new FileReader();
 reader.onload=e=>{const img=new Image();img.onload=()=>{const MAX=800;let w=img.width,h=img.height;if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r)}const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;canvas.getContext("2d").drawImage(img,0,0,w,h);callback(canvas.toDataURL("image/jpeg",.8))};img.src=e.target.result};
 reader.readAsDataURL(file);
}

const profileForm=document.getElementById("profileForm");
if(profileForm){
 const editingId=document.getElementById("editingId"),photo=document.getElementById("photo"),name=document.getElementById("fullName"),dob=document.getElementById("dob"),rank=document.getElementById("rank"),group=document.getElementById("group"),status=document.getElementById("status"),saveBtn=document.getElementById("saveButton"),cancel=document.getElementById("cancelEditButton");
 function showStatus(msg,type){status.textContent=msg;status.className=`status ${type||""}`}
 function resetForm(){profileForm.reset();editingId.value="";saveBtn.textContent="Add Profile";cancel.hidden=true;document.getElementById("formHeading").textContent="Add Profile"}
 profileForm.addEventListener("submit",e=>{e.preventDefault();const fullName=name.value.trim(),d=dob.value,r=rank.value,g=group.value,file=photo.files[0];if(!fullName||!d||!r||!g){showStatus("Please complete all required fields.","error");return}const profiles=getProfiles();
  if(editingId.value){const i=profiles.findIndex(x=>x.id===Number(editingId.value));if(i<0)return;const update=image=>{profiles[i]={...profiles[i],fullName,dob:d,rank:r,group:g,image:image||profiles[i].image};saveProfiles(profiles);resetForm();renderMainProfiles();showStatus(`${fullName} was updated successfully.`,"success")};file?readImage(file,update):update(null);return}
  if(!file){showStatus("Please select a picture.","error");return}
  readImage(file,image=>{profiles.push({id:Date.now(),fullName,dob:d,rank:r,group:g,image});saveProfiles(profiles);profileForm.reset();renderMainProfiles();showStatus(`${fullName} was added successfully.`,"success")});
 });
 cancel.addEventListener("click",resetForm);
}

function renderMainProfiles(){
 const c=document.getElementById("profiles");if(!c)return;
 const search=document.getElementById("searchInput")?.value.toLowerCase()||"",gf=document.getElementById("filterGroup")?.value||"",rf=document.getElementById("filterRank")?.value||"";
 let p=getProfiles().filter(x=>x.fullName.toLowerCase().includes(search)&&(!gf||x.group===gf)&&(!rf||x.rank===rf));
 p.sort((a,b)=>roleHierarchy[a.rank]-roleHierarchy[b.rank]||a.fullName.localeCompare(b.fullName));renderProfiles(p);
}
document.getElementById("searchInput")?.addEventListener("input",renderMainProfiles);
document.getElementById("filterGroup")?.addEventListener("change",renderMainProfiles);
document.getElementById("filterRank")?.addEventListener("change",renderMainProfiles);

const groupTitle=document.getElementById("groupTitle");
if(groupTitle){
 const selected=new URLSearchParams(location.search).get("group");groupTitle.textContent=selected||"Group Profiles";document.title=`${selected||"Group"} - Profile Directory`;
 const render=()=>{const search=document.getElementById("groupSearch")?.value.toLowerCase()||"",rf=document.getElementById("groupRankFilter")?.value||"";let p=getProfiles().filter(x=>x.group===selected&&x.fullName.toLowerCase().includes(search)&&(!rf||x.rank===rf));p.sort((a,b)=>roleHierarchy[a.rank]-roleHierarchy[b.rank]||a.fullName.localeCompare(b.fullName));renderProfiles(p)};
 document.getElementById("groupSearch")?.addEventListener("input",render);document.getElementById("groupRankFilter")?.addEventListener("change",render);render();
}

function renderProfiles(profiles){const c=document.getElementById("profiles"),empty=document.getElementById("emptyMessage");if(!c)return;c.innerHTML="";empty.hidden=profiles.length>0;if(!profiles.length)return;profiles.forEach(p=>c.appendChild(createProfileCard(p)))}
function createProfileCard(p){
 const a=document.createElement("article");a.className="profile-card";
 const img=document.createElement("img");img.className="profile-image";img.src=p.image;img.alt=`Profile photograph of ${p.fullName}`;
 const d=document.createElement("div");d.className="profile-details";
 [["Full Name",p.fullName],["D.O.B",formatDate(p.dob)],["Role",p.rank],["Group",p.group]].forEach(([l,v])=>{const line=document.createElement("p"),s=document.createElement("strong");s.textContent=`${l}: `;line.append(s,v);d.appendChild(line)});
 const actions=document.createElement("div");actions.className="card-actions";
 const edit=document.createElement("button");edit.type="button";edit.className="button secondary";edit.textContent="Edit";edit.addEventListener("click",()=>editProfile(p));
 const del=document.createElement("button");del.type="button";del.className="button delete";del.textContent="Delete";del.setAttribute("aria-label",`Delete ${p.fullName}`);del.addEventListener("click",()=>{if(!confirm(`Delete ${p.fullName}?`))return;saveProfiles(getProfiles().filter(x=>x.id!==p.id));if(document.getElementById("groupTitle"))location.reload();else renderMainProfiles()});
 actions.append(edit,del);a.append(img,d,actions);return a;
}
function editProfile(p){if(!document.getElementById("profileForm")){location.href="index.html";return}document.getElementById("editingId").value=p.id;document.getElementById("fullName").value=p.fullName;document.getElementById("dob").value=p.dob;document.getElementById("rank").value=p.rank;document.getElementById("group").value=p.group;document.getElementById("formHeading").textContent=`Edit: ${p.fullName}`;document.getElementById("saveButton").textContent="Save Changes";document.getElementById("cancelEditButton").hidden=false;scrollTo({top:0,behavior:"smooth"})}
function formatDate(v){if(!v)return"";return new Date(v+"T00:00:00").toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"})}

const exportButton=document.getElementById("exportButton"),importInput=document.getElementById("importInput"),backupStatus=document.getElementById("backupStatus");
function showBackupStatus(msg,type){if(backupStatus){backupStatus.textContent=msg;backupStatus.className=`status ${type||""}`}}
if(exportButton)exportButton.addEventListener("click",()=>{const profiles=getProfiles();if(!profiles.length){showBackupStatus("There are no profiles to export.","error");return}const backup={version:1,createdAt:new Date().toISOString(),profiles};const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`profile-directory-backup-${new Date().toISOString().split("T")[0]}.json`;document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);showBackupStatus("Backup exported successfully.","success")});
if(importInput)importInput.addEventListener("change",()=>{const file=importInput.files[0];if(!file)return;const reader=new FileReader();reader.onload=e=>{try{const backup=JSON.parse(e.target.result);if(!backup.profiles||!Array.isArray(backup.profiles))throw Error("Invalid");if(!confirm("Import this backup and replace all current profiles?")){importInput.value="";showBackupStatus("Import cancelled.","");return}saveProfiles(backup.profiles);importInput.value="";showBackupStatus(`${backup.profiles.length} profiles were restored successfully.`,"success");renderMainProfiles()}catch{importInput.value="";showBackupStatus("The selected file is not a valid backup.","error")}};reader.readAsText(file)});
if(document.getElementById("profileForm"))renderMainProfiles();