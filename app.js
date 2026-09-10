import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, writeBatch, deleteField
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const RANKS=["Gang Leader","Sub Leader","Enforcer","Shooter","Soldier","Runner","Associate"];
const GANGS=["Sixx Gang","Unruly Gang","7Seven Gang","Alien Gang","1800 Gang","Muslim City/9 Gang","Rasta City Gang"];
const CAUTIONS=["Firearm Offender","Drug Offender","Violent","Breaker","Sexual Offender","Murderer"];
let profiles=[];
let currentUser=null;
let currentAccount=null;
let directoryUsers=[];
let managingProfileId=null;
let registrationInProgress = false;

const $=id=>document.getElementById(id);
const rankIndex=r=>{const i=RANKS.indexOf(r);return i<0?999:i};
const esc=v=>{const d=document.createElement("div");d.textContent=v??"";return d.innerHTML};
const formatDate=v=>v?new Date(v+"T00:00:00").toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"}):"";
const profileCollection=()=>collection(db,"profiles");
const canEdit=p=>currentAccount&&(currentAccount.role==="admin"||p.createdByUid===currentUser.uid||(p.editorIds||[]).includes(currentUser.uid));
const isAdmin=()=>currentAccount?.role==="admin";

function nav(){const c=$("gangNavigation");if(!c)return;const current=new URLSearchParams(location.search).get("gang");c.innerHTML=GANGS.map(g=>`<a class="nav-item gang-link ${current===g?"active":""}" href="group.html?gang=${encodeURIComponent(g)}">${esc(g)}</a>`).join("");const menu=c.closest(".gang-menu");if(menu&&current)menu.open=true}
function renderAccount(){if($("officerDisplay"))$("officerDisplay").textContent=currentAccount?.officerName||currentUser?.email||"";if($("roleDisplay"))$("roleDisplay").textContent=(currentAccount?.role||"user").toUpperCase()}

function card(p){
 const img=p.photo?`<img class="profile-image" src="${p.photo}" alt="Photo of ${esc(p.fullName)}">`:`<div class="profile-image" aria-label="No profile photo"></div>`;
 const actions=[];
 if(canEdit(p)) actions.push(`<button class="primary-button edit-profile" data-id="${p.id}" type="button" title="Edit profile" aria-label="Edit profile">✎</button>`);
 if(isAdmin()) actions.push(`<button class="secondary-button editors-profile icon-only-button" data-id="${p.id}" type="button" title="Manage editor permissions" aria-label="Manage editor permissions">⚿</button><button class="danger-button delete-profile icon-only-button" data-id="${p.id}" type="button" title="Delete profile" aria-label="Delete profile">🗑</button>`);
 const audit=p.createdByOfficerName?`<p class="audit-line">Added by ${esc(p.createdByOfficerName)}${p.lastEditedByOfficerName?` · Edited by ${esc(p.lastEditedByOfficerName)}`:""}</p>`:"";
 return `<article class="profile-card profile-card-clickable" data-profile-id="${p.id}" tabindex="0" role="button" aria-label="Open profile for ${esc(p.fullName)}"><div class="card-top"><div class="card-photo-wrap">${img}</div><span class="rank-badge">${esc(p.rank)}</span></div><h3>${esc(p.fullName)}</h3><p>▣ D.O.B: ${esc(formatDate(p.dob))}</p><p>♙ Rank: ${esc(p.rank)}</p><p>♛ Gang: ${esc(p.gang)}</p>${audit}${actions.length?`<div class="card-actions">${actions.join("")}</div>`:""}</article>`;
}
function bindCards(){
 document.querySelectorAll(".profile-card-clickable").forEach(c=>{
   const open=()=>{const id=c.dataset.profileId;if(id)location.href=`profile.html?id=${encodeURIComponent(id)}`};
   c.addEventListener("click",e=>{if(e.target.closest("button,a,input,select,textarea"))return;open()});
   c.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&!e.target.closest("button,input,select,textarea")){e.preventDefault();open()}});
 });
 document.querySelectorAll(".edit-profile").forEach(b=>b.onclick=e=>{e.stopPropagation();editProfile(b.dataset.id)});
 document.querySelectorAll(".delete-profile").forEach(b=>b.onclick=e=>{e.stopPropagation();deleteProfile(b.dataset.id)});
 document.querySelectorAll(".editors-profile").forEach(b=>b.onclick=e=>{e.stopPropagation();openEditorPermissions(b.dataset.id)});
}
function sorted(list,sort="rank"){const a=[...list];if(sort==="name")return a.sort((x,y)=>x.fullName.localeCompare(y.fullName));if(sort==="newest")return a.sort((x,y)=>(y.createdAtMs||0)-(x.createdAtMs||0));return a.sort((x,y)=>rankIndex(x.rank)-rankIndex(y.rank)||x.fullName.localeCompare(y.fullName))}

async function loadAccount() {
  if (!currentUser?.uid) {
    throw new Error("No authenticated user was found.");
  }

  const userRef = doc(db, "users", currentUser.uid);

  // Prevent the app from being stuck forever if Firestore does not respond.
  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("Timed out while loading your directory account.")),
      10000
    )
  );

  const accountLoad = (async () => {
    const snap = await getDoc(userRef);

    /*
     * If the Firestore users/{uid} document does not exist,
     * recreate it as a normal user.
     *
     * IMPORTANT:
     * We do NOT change the role of an existing account.
     */
    if (!snap.exists()) {

      const officerName =
        (currentUser.displayName || "").trim() ||
        currentUser.email ||
        "Unnamed Officer";

      const email =
        currentUser.email || "";

      await setDoc(userRef, {
        officerName,
        email,
        role: "user",
        createdAt: serverTimestamp()
      });

      currentAccount = {
        officerName,
        email,
        role: "user"
      };

      return;
    }

    /*
     * Existing Firestore account.
     */
    const data = snap.data();

    const existingOfficerName =
      typeof data.officerName === "string"
        ? data.officerName.trim()
        : "";

    const authOfficerName =
      typeof currentUser.displayName === "string"
        ? currentUser.displayName.trim()
        : "";

    /*
     * Officer Name priority:
     *
     * 1. Existing Firestore Officer Name
     * 2. Firebase Authentication displayName
     * 3. Firebase email
     * 4. Fallback
     *
     * This prevents us from accidentally replacing an existing
     * Officer Name with an email.
     */
    const repairedOfficerName =
      existingOfficerName ||
      authOfficerName ||
      currentUser.email ||
      "Unnamed Officer";

    /*
     * Firebase Authentication email is the authoritative email.
     */
    const authEmail =
      currentUser.email || "";

    const existingEmail =
      typeof data.email === "string"
        ? data.email.trim()
        : "";

    /*
     * Only repair fields that actually need repairing.
     */
    const updates = {};

    if (repairedOfficerName !== existingOfficerName) {
      updates.officerName = repairedOfficerName;
    }

    if (authEmail && authEmail !== existingEmail) {
      updates.email = authEmail;
    }

    if (Object.keys(updates).length > 0) {
      await updateDoc(userRef, updates);
    }

    /*
     * IMPORTANT:
     * Preserve the existing role.
     */
    currentAccount = {
      ...data,
      ...updates
    };
  })();

  await Promise.race([
    accountLoad,
    timeout
  ]);

  renderAccount();
}

async function saveEditorPermissions(){
 if(!isAdmin()||!managingProfileId)return;const status=$("editorsStatus");try{const editorIds=[...document.querySelectorAll("#editorList input:checked")].map(i=>i.value);await updateDoc(doc(db,"profiles",managingProfileId),{editorIds,lastEditedByUid:currentUser.uid,lastEditedByOfficerName:currentAccount.officerName,lastEditedAt:serverTimestamp()});const p=profiles.find(x=>x.id===managingProfileId);if(p)p.editorIds=editorIds;status.textContent="Editor permissions saved.";status.className="success";renderDashboard();renderGroup()}catch(e){status.textContent=e.message||"Could not save permissions.";status.className="error"}}

async function renderUsers(){if(!isAdmin()||!$("usersList"))return;await loadUsers();$("usersList").innerHTML=directoryUsers.map(u=>`<div class="user-row"><div><strong>${esc(u.officerName||"Unnamed Officer")}</strong><small>${esc(u.email||"")}</small></div><select class="role-select" data-id="${u.id}"><option value="user" ${u.role==="user"?"selected":""}>User</option><option value="editor" ${u.role==="editor"?"selected":""}>Editor</option><option value="admin" ${u.role==="admin"?"selected":""}>Administrator</option></select></div>`).join("");document.querySelectorAll(".role-select").forEach(s=>s.onchange=()=>changeRole(s.dataset.id,s.value));}
async function changeRole(uid,roleValue){const status=$("usersStatus");try{await updateDoc(doc(db,"users",uid),{role:roleValue,adminSetupCode:deleteField()});const u=directoryUsers.find(x=>x.id===uid);if(u)u.role=roleValue;status.textContent="User role updated.";status.className="success";if(uid===currentUser.uid){currentAccount.role=roleValue;renderAccount()}}catch(e){status.textContent=e.message||"Could not update role.";status.className="error"}}

async function saveProfileDetails(id){
 const p=profiles.find(x=>x.id===id);if(!p||!currentUser||!currentAccount)return;
 const cautions=[...document.querySelectorAll("#detailCautions input:checked")].map(i=>i.value);
 const notes=$("detailNotes")?.value.slice(0,255)||"";
 const status=$("detailStatus");
 try{
   if(status){status.textContent="Saving changes...";status.className="";}
   await updateDoc(doc(db,"profiles",id),{cautions,notes,lastEditedByUid:currentUser.uid,lastEditedByOfficerName:currentAccount.officerName,lastEditedAt:serverTimestamp()});
   p.cautions=cautions;p.notes=notes;p.lastEditedByUid=currentUser.uid;p.lastEditedByOfficerName=currentAccount.officerName;
   renderProfileDetail(p,false);
   if(status){status.textContent="Profile updated successfully.";status.className="success";}
 }catch(e){if(status){status.textContent=e.message||"Could not save profile.";status.className="error";}}
}
function openProfilePhoto(p){
 if(!p?.photo)return;
 let modal=$("profilePhotoModal");
 if(!modal){
   modal=document.createElement("div");
   modal.id="profilePhotoModal";
   modal.className="profile-photo-modal";
   modal.innerHTML=`<div class="profile-photo-backdrop" data-close-photo></div><div class="profile-photo-dialog" role="dialog" aria-modal="true" aria-label="Enlarged profile photo"><button type="button" class="profile-photo-close" aria-label="Close enlarged photo" data-close-photo>×</button><img id="profilePhotoLarge" class="profile-photo-large" alt=""><div id="profilePhotoWatermark" class="profile-photo-watermark"></div></div>`;
   document.body.appendChild(modal);
   modal.querySelectorAll("[data-close-photo]").forEach(el=>el.addEventListener("click",closeProfilePhoto));
 }
 const image=$("profilePhotoLarge"),watermark=$("profilePhotoWatermark");
 image.src=p.photo;image.alt=`Photo of ${p.fullName||"profile"}`;
 watermark.textContent=p.fullName||"";
 modal.hidden=false;document.body.classList.add("photo-modal-open");
 document.addEventListener("keydown",handlePhotoModalKey);
}
function closeProfilePhoto(){const modal=$("profilePhotoModal");if(!modal)return;modal.hidden=true;document.body.classList.remove("photo-modal-open");document.removeEventListener("keydown",handlePhotoModalKey);}
function handlePhotoModalKey(e){if(e.key==="Escape")closeProfilePhoto();}
function renderProfileDetail(p,editing=false){
 const photo=$("detailPhoto");if(photo){if(p.photo){photo.src=p.photo;photo.hidden=false;photo.onclick=()=>openProfilePhoto(p);photo.setAttribute("role","button");photo.setAttribute("tabindex","0");photo.setAttribute("aria-label",`Enlarge photo of ${p.fullName||"profile"}`);photo.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openProfilePhoto(p);}};}else{photo.removeAttribute("src");photo.hidden=true;photo.onclick=null;photo.removeAttribute("role");photo.removeAttribute("tabindex");}}
 if($("detailName"))$("detailName").textContent=p.fullName||"";
 if($("detailRank"))$("detailRank").textContent=p.rank||"";
 if($("detailDob"))$("detailDob").textContent=`D.O.B: ${formatDate(p.dob)}`;if($("detailAddress"))$("detailAddress").textContent=p.address?`Address: ${p.address}`:"Address: Not provided";
 if($("detailGang"))$("detailGang").textContent=p.gang||"";
 const selected=new Set(p.cautions||[]);
 const box=$("detailCautions");if(box)box.innerHTML=CAUTIONS.map(c=>`<label class="caution-row"><input type="checkbox" value="${esc(c)}" ${selected.has(c)?"checked":""} ${editing?"":"disabled"}><span>${esc(c)}</span></label>`).join("");
 const notes=$("detailNotes");if(notes){notes.value=p.notes||"";notes.readOnly=!editing;notes.maxLength=255;}
 const counter=$("notesCounter");if(counter)counter.textContent=`${(p.notes||"").length} / 255`;
 const editBtn=$("detailEditButton"),saveBtn=$("detailSaveButton"),cancelBtn=$("detailCancelButton");
 if(editBtn){editBtn.hidden=editing||!currentUser;editBtn.onclick=()=>renderProfileDetail(p,true);}
 if(saveBtn){saveBtn.hidden=!editing;saveBtn.onclick=()=>saveProfileDetails(p.id);}
 if(cancelBtn){cancelBtn.hidden=!editing;cancelBtn.onclick=()=>renderProfileDetail(p,false);}
 const del=$("detailDeleteButton");if(del){del.hidden=!isAdmin();del.onclick=()=>deleteProfileFromDetail(p.id);}
 const perm=$("detailPermissionsButton");if(perm){perm.hidden=!isAdmin();perm.onclick=()=>openEditorPermissionsFromDetail(p);}
 if(notes)notes.oninput=()=>{if(counter)counter.textContent=`${notes.value.length} / 255`;};
 const editPhotoNote=$("detailEditHint");if(editPhotoNote)editPhotoNote.hidden=!editing;
}
async function deleteProfileFromDetail(id){const p=profiles.find(x=>x.id===id);if(!p||!isAdmin()||!confirm(`Delete ${p.fullName}? This cannot be undone.`))return;try{await deleteDoc(doc(db,"profiles",id));location.href="index.html";}catch(e){const s=$("detailStatus");if(s){s.textContent=e.message;s.className="error";}}}
async function openEditorPermissionsFromDetail(p){if(!isAdmin())return;await openEditorPermissions(p.id);}
async function setupProfileDetail(){
 const id=new URLSearchParams(location.search).get("id");if(!id)return;
 await loadProfiles();const p=profiles.find(x=>x.id===id);if(!p){if($("detailStatus"))$("detailStatus").textContent="Profile not found.";return;}
 if($("backButton"))$("backButton").onclick=()=>history.length>1?history.back():(location.href="index.html");
 if($("detailPermissionsButton"))$("detailPermissionsButton").hidden=!isAdmin();
 renderProfileDetail(p,new URLSearchParams(location.search).get("edit")==="1"&&canEdit(p));
}

function setupLogout(){const b=$("logoutButton");if(b)b.onclick=async()=>{await signOut(auth);location.href="login.html"};}

function setupDashboard(){
 const form=$("profileForm");if(!form)return;
 $("showAddProfile").onclick=()=>{resetForm();$("profileFormPanel").hidden=false;$("profileFormPanel").scrollIntoView({behavior:"smooth"})};$("closeFormButton").onclick=()=>$("profileFormPanel").hidden=true;$("cancelEditButton").onclick=resetForm;
 $("showUsersButton")?.addEventListener("click",async()=>{await renderUsers();$("userManagementPanel").hidden=false;$("userManagementPanel").scrollIntoView({behavior:"smooth"})});
 const photoInput=$("photo"),cameraInput=$("cameraPhoto"),chooseInput=$("choosePhoto");
 const usePhoto=file=>{if(!file)return;const dt=new DataTransfer();dt.items.add(file);photoInput.files=dt.files;const r=new FileReader();r.onload=()=>{if($("photoPreview")){$("photoPreview").src=r.result;$("photoPreview").hidden=false;}if($("photoFileName"))$("photoFileName").textContent=file.name||"Picture selected";};r.readAsDataURL(file);};
 cameraInput?.addEventListener("change",()=>usePhoto(cameraInput.files[0]));chooseInput?.addEventListener("change",()=>usePhoto(chooseInput.files[0]));photoInput?.addEventListener("change",()=>usePhoto(photoInput.files[0]));
 $("takePhotoButton")?.addEventListener("click",()=>cameraInput?.click());
 $("choosePhotoButton")?.addEventListener("click",()=>chooseInput?.click());$("closeUsersButton")?.addEventListener("click",()=>$("userManagementPanel").hidden=true);$("closeEditorsButton")?.addEventListener("click",()=>$("editorPanel").hidden=true);$("saveEditorsButton")?.addEventListener("click",saveEditorPermissions);
 form.onsubmit=async e=>{e.preventDefault();const id=$("editingId").value||crypto.randomUUID();const old=profiles.find(x=>x.id===id);if(old&&!canEdit(old))return;let photo=old?.photo||"";const file=$("photo").files[0];const status=$("status");try{status.textContent="Saving profile...";status.className="";if(file)photo=await compressImage(file);const p={fullName:$("fullName").value.trim(),dob:$("dob").value,address:$("address").value.trim(),rank:$("rank").value,gang:$("gang").value,photo,cautions:old?.cautions||[],notes:old?.notes||"",createdAtMs:old?.createdAtMs||Date.now(),createdByUid:old?.createdByUid||currentUser.uid,createdByOfficerName:old?.createdByOfficerName||currentAccount.officerName,editorIds:old?.editorIds||[],lastEditedByUid:currentUser.uid,lastEditedByOfficerName:currentAccount.officerName,lastEditedAt:serverTimestamp()};await setDoc(doc(db,"profiles",id),p,{merge:true});const saved={id,...p};const i=profiles.findIndex(x=>x.id===id);if(i>=0)profiles[i]=saved;else profiles.push(saved);status.textContent=i>=0?"Profile updated successfully.":"Profile added successfully.";status.className="success";resetForm();renderDashboard()}catch(err){status.textContent=err.message||"Could not save profile.";status.className="error"}};
 ["searchInput","filterRank","sortSelect"].forEach(id=>$(id)?.addEventListener("input",renderDashboard));$("filterRank")?.addEventListener("change",renderDashboard);$("sortSelect")?.addEventListener("change",renderDashboard);
 $("exportButton").onclick=()=>{const blob=new Blob([JSON.stringify(profiles,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="rogue-gallery-backup.json";a.click();URL.revokeObjectURL(a.href)};
 $("importInput").onchange=async e=>{const status=$("backupStatus");try{const data=JSON.parse(await e.target.files[0].text());if(!Array.isArray(data))throw new Error("Invalid backup file.");for(const raw of data){const id=crypto.randomUUID();const p={fullName:raw.fullName||"",dob:raw.dob||"",address:raw.address||"",rank:raw.rank||"Associate",gang:raw.gang||GANGS[0],photo:raw.photo||"",cautions:Array.isArray(raw.cautions)?raw.cautions:[],notes:typeof raw.notes==="string"?raw.notes.slice(0,255):"",createdAtMs:Date.now(),createdByUid:currentUser.uid,createdByOfficerName:currentAccount.officerName,editorIds:[],lastEditedByUid:currentUser.uid,lastEditedByOfficerName:currentAccount.officerName,lastEditedAt:serverTimestamp()};await setDoc(doc(db,"profiles",id),p)}await loadProfiles();renderDashboard();status.textContent="Backup imported successfully.";status.className="success"}catch(err){status.textContent=err.message||"Could not import this backup.";status.className="error"}finally{e.target.value=""}};
}

function setupLogin(){const f=$("loginForm");if(!f)return;f.onsubmit=async e=>{e.preventDefault();const status=$("loginStatus");try{await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value);status.textContent="Signed in successfully.";status.className="success"}catch(err){status.textContent=err.message.replace("Firebase: ","");status.className="error"}}}
function setupRegister() {
  const f = $("registerForm");
  if (!f) return;

  f.onsubmit = async e => {
    e.preventDefault();

    const status = $("registerStatus");
    

    const officerName = $("officerName").value.trim();
    const email = $("email").value.trim();
    const password = $("password").value;
    const confirmPassword = $("confirmPassword").value;
    const code = $("adminSetupCode").value.trim();

    if (password !== confirmPassword) {
      status.textContent = "Passwords do not match.";
      status.className = "error";
      return;
    }

    if (!officerName) {
      status.textContent = "Officer Name is required.";
      status.className = "error";
      return;
    }

    if (!email) {
      status.textContent = "Email is required.";
      status.className = "error";
      return;
    }

    try {

      registrationInProgress = true;

      /*
       * STEP 1
       * Create Firebase Authentication account.
       */
      const credential =
        await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

      const user = credential.user;
      const uid = user.uid;

      /*
       * STEP 2
       * Store Officer Name in Firebase Authentication.
       */
      await updateProfile(user, {
        displayName: officerName
      });

      /*
       * STEP 3
       * Create matching Firestore users/{uid} document.
       */
      const userRef = doc(db, "users", uid);

      /*
       * ADMIN REGISTRATION
       */
      if (code) {

        const batch = writeBatch(db);

        batch.set(userRef, {
          officerName,
          email,
          role: "admin",
          adminSetupCode: code,
          createdAt: serverTimestamp()
        });

        batch.update(
          doc(db, "system", "bootstrap"),
          {
            enabled: false
          }
        );

        await batch.commit();

        /*
         * Remove temporary setup code.
         */
        await updateDoc(userRef, {
          adminSetupCode: deleteField()
        });

      } else {

        /*
         * NORMAL USER REGISTRATION
         */
        await setDoc(userRef, {
          officerName,
          email,
          role: "user",
          createdAt: serverTimestamp()
        });
      }

      /*
       * Update local account immediately.
       */
      currentUser = user;

      currentAccount = {
        officerName,
        email,
        role: code ? "admin" : "user"
      };

      renderAccount();

      status.textContent = "Account created successfully.";
      status.className = "success";

      /*
       * Firebase has already authenticated the user.
       * Send them to the directory.
       */
      registrationInProgress = false;

setTimeout(() => {
  location.replace("index.html");
}, 500);

    } catch (err) {

  registrationInProgress = false;

      /*
       * IMPORTANT:
       *
       * DO NOT call deleteUser() here.
       *
       * If Firestore fails after Authentication succeeds,
       * deleting the Auth account makes troubleshooting much
       * harder and can make it appear registration never worked.
       */
      console.error("Registration error:", err);

      status.textContent =
        err.message?.replace("Firebase: ", "") ||
        "Could not create account.";

      status.className = "error";
    }
  };
}
function setupPWA(){
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
}

function finishLoading() {

  /*
   * Support common loading element IDs used by the app.
   */
  const ids = [
    "loadingScreen",
    "loadingOverlay",
    "appLoading",
    "loader",
    "loading"
  ];

  ids.forEach(id => {
    const el = $(id);

    if (el) {
      el.hidden = true;
      el.style.display = "none";
    }
  });

  /*
   * Also remove common loading classes from the body.
   */
  document.body.classList.remove(
    "loading",
    "is-loading",
    "app-loading"
  );
}
async function boot() {

  try {

    setupPWA();
    nav();
    setupLogin();
    setupRegister();
    setupLogout();
    setupDashboard();

    onAuthStateChanged(auth, async user => {

      const page =
        location.pathname.split("/").pop() || "index.html";

      const privatePages = [
        "index.html",
        "group.html",
        "profile.html",
        ""
      ];

      /*
       * USER IS LOGGED IN
       */
      if (user) {

        currentUser = user;

        /*
         * Login/register pages should never remain visible
         * after authentication succeeds.
         */
        if (
  (page === "login.html" || page === "register.html") &&
  !registrationInProgress
) {
  location.replace("index.html");
  return;
}

        try {

          /*
           * Load Firestore account first.
           */
          await loadAccount();

          /*
           * Profile detail page.
           */
          if (page === "profile.html") {

            await setupProfileDetail();

          } else {

            /*
             * Directory pages.
             */
            await loadProfiles();

            /*
             * Show User Management only to administrators.
             */
            if (
              isAdmin() &&
              $("showUsersButton")
            ) {
              $("showUsersButton").hidden = false;
            }

            renderDashboard();
            renderGroup();
          }

          /*
           * Loading is finished successfully.
           */
          finishLoading();

        } catch (e) {

          console.error(
            "Directory boot error:",
            e
          );

          const msg =
            $("status") ||
            $("backupStatus") ||
            $("registerStatus");

          if (msg) {
            msg.textContent =
              "Could not load directory account: " +
              (e.message || "Unknown error");

            msg.className = "error";
          }

          /*
           * VERY IMPORTANT:
           * Don't leave the user staring at Loading forever.
           */
          finishLoading();
        }

      } else {

        /*
         * USER IS NOT LOGGED IN.
         */
        currentUser = null;
        currentAccount = null;

        if (privatePages.includes(page)) {
          location.replace("login.html");
          return;
        }

        finishLoading();
      }
    });

  } catch (e) {

    console.error(
      "Application boot error:",
      e
    );

    finishLoading();
  }
}document.addEventListener("DOMContentLoaded",boot);
