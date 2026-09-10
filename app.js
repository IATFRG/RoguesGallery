import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  deleteUser,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  deleteField
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const RANKS = [
  "Gang Leader",
  "Sub Leader",
  "Enforcer",
  "Shooter",
  "Soldier",
  "Runner",
  "Associate"
];

const GANGS = [
  "Sixx Gang",
  "Unruly Gang",
  "7Seven Gang",
  "Alien Gang",
  "1800 Gang",
  "Muslim City/9 Gang",
  "Rasta City Gang"
];

const CAUTIONS = [
  "Firearm Offender",
  "Drug Offender",
  "Violent",
  "Breaker",
  "Sexual Offender",
  "Murderer"
];

let profiles = [];
let currentUser = null;
let currentAccount = null;
let directoryUsers = [];
let managingProfileId = null;

const $ = id => document.getElementById(id);

const rankIndex = r => {
  const i = RANKS.indexOf(r);
  return i < 0 ? 999 : i;
};

const esc = v => {
  const d = document.createElement("div");
  d.textContent = v ?? "";
  return d.innerHTML;
};

const formatDate = v =>
  v
    ? new Date(v + "T00:00:00").toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric"
      })
    : "";

const profileCollection = () => collection(db, "profiles");

const canEdit = p =>
  currentAccount &&
  (
    currentAccount.role === "admin" ||
    p.createdByUid === currentUser.uid ||
    (p.editorIds || []).includes(currentUser.uid)
  );

const isAdmin = () => currentAccount?.role === "admin";

function nav() {
  const c = $("gangNavigation");
  if (!c) return;

  const current = new URLSearchParams(location.search).get("gang");

  c.innerHTML = GANGS.map(
    g =>
      `<a class="nav-item gang-link ${
        current === g ? "active" : ""
      }" href="group.html?gang=${encodeURIComponent(g)}">${esc(g)}</a>`
  ).join("");

  const menu = c.closest(".gang-menu");
  if (menu && current) menu.open = true;
}

function renderAccount() {
  if ($("officerDisplay")) {
    $("officerDisplay").textContent =
      currentAccount?.officerName || currentUser?.email || "";
  }

  if ($("roleDisplay")) {
    $("roleDisplay").textContent =
      (currentAccount?.role || "user").toUpperCase();
  }
}

function card(p) {
  const img = p.photo
    ? `<img class="profile-image" src="${p.photo}" alt="Photo of ${esc(
        p.fullName
      )}">`
    : `<div class="profile-image" aria-label="No profile photo"></div>`;

  const actions = [];

  if (canEdit(p)) {
    actions.push(
      `<button class="primary-button edit-profile" data-id="${p.id}" type="button" title="Edit profile" aria-label="Edit profile">✎</button>`
    );
  }

  if (isAdmin()) {
    actions.push(
      `<button class="secondary-button editors-profile icon-only-button" data-id="${p.id}" type="button" title="Manage editor permissions" aria-label="Manage editor permissions">⚿</button>`,
      `<button class="danger-button delete-profile icon-only-button" data-id="${p.id}" type="button" title="Delete profile" aria-label="Delete profile">🗑</button>`
    );
  }

  const audit = p.createdByOfficerName
    ? `<p class="audit-line">Added by ${esc(p.createdByOfficerName)}${
        p.lastEditedByOfficerName
          ? ` · Edited by ${esc(p.lastEditedByOfficerName)}`
          : ""
      }</p>`
    : "";

  return `
    <article
      class="profile-card profile-card-clickable"
      data-profile-id="${p.id}"
      tabindex="0"
      role="button"
      aria-label="Open profile for ${esc(p.fullName)}"
    >
      <div class="card-top">
        <div class="card-photo-wrap">${img}</div>
        <span class="rank-badge">${esc(p.rank)}</span>
      </div>

      <h3>${esc(p.fullName)}</h3>
      <p>▣ D.O.B: ${esc(formatDate(p.dob))}</p>
      <p>♙ Rank: ${esc(p.rank)}</p>
      <p>♛ Gang: ${esc(p.gang)}</p>

      ${audit}

      ${
        actions.length
          ? `<div class="card-actions">${actions.join("")}</div>`
          : ""
      }
    </article>
  `;
}

function bindCards() {
  document.querySelectorAll(".profile-card-clickable").forEach(c => {
    const open = () => {
      const id = c.dataset.profileId;
      if (id) {
        location.href = `profile.html?id=${encodeURIComponent(id)}`;
      }
    };

    c.addEventListener("click", e => {
      if (e.target.closest("button,a,input,select,textarea")) return;
      open();
    });

    c.addEventListener("keydown", e => {
      if (
        (e.key === "Enter" || e.key === " ") &&
        !e.target.closest("button,input,select,textarea")
      ) {
        e.preventDefault();
        open();
      }
    });
  });

  document.querySelectorAll(".edit-profile").forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      editProfile(b.dataset.id);
    };
  });

  document.querySelectorAll(".delete-profile").forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      deleteProfile(b.dataset.id);
    };
  });

  document.querySelectorAll(".editors-profile").forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      openEditorPermissions(b.dataset.id);
    };
  });
}

function sorted(list, sort = "rank") {
  const a = [...list];

  if (sort === "name") {
    return a.sort((x, y) =>
      x.fullName.localeCompare(y.fullName)
    );
  }

  if (sort === "newest") {
    return a.sort(
      (x, y) => (y.createdAtMs || 0) - (x.createdAtMs || 0)
    );
  }

  return a.sort(
    (x, y) =>
      rankIndex(x.rank) - rankIndex(y.rank) ||
      x.fullName.localeCompare(y.fullName)
  );
}


/* =========================================================
   USER ACCOUNT
   ========================================================= */

async function loadAccount() {
  const userRef = doc(db, "users", currentUser.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    // Automatically create a Firestore directory account
    // for an existing Firebase Authentication user.
    //
    // displayName will be available for NEW users because
    // registration now saves the Officer Name to Firebase Auth.
    const officerName =
      currentUser.displayName ||
      currentUser.email ||
      "Unnamed Officer";

    const email = currentUser.email || "";

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
  } else {
    currentAccount = snap.data();
  }

  renderAccount();
}


/* =========================================================
   PROFILES
   ========================================================= */

async function loadProfiles() {
  const snap = await getDocs(profileCollection());

  profiles = snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

async function loadUsers() {
  if (!isAdmin()) return;

  const snap = await getDocs(collection(db, "users"));

  directoryUsers = snap.docs
    .map(d => ({
      id: d.id,
      ...d.data()
    }))
    .sort((a, b) =>
      (a.officerName || "").localeCompare(b.officerName || "")
    );
}

function renderDashboard() {
  const c = $("profiles");
  if (!c) return;

  const search =
    $("searchInput")?.value.toLowerCase() || "";

  const filter =
    $("filterRank")?.value || "";

  const sort =
    $("sortSelect")?.value || "rank";

  const list = sorted(
    profiles.filter(
      p =>
        p.fullName.toLowerCase().includes(search) &&
        (!filter || p.rank === filter)
    ),
    sort
  );

  c.innerHTML = list.map(card).join("");

  $("emptyMessage").hidden = list.length > 0;

  bindCards();
}

function renderGroup() {
  const title = $("gangTitle");
  if (!title) return;

  const gang =
    new URLSearchParams(location.search).get("gang") ||
    GANGS[0];

  title.textContent = gang;

  const list = sorted(
    profiles.filter(p => p.gang === gang)
  );

  $("profiles").innerHTML = list.map(card).join("");

  $("emptyMessage").hidden = list.length > 0;

  bindCards();
}

function resetForm() {
  const f = $("profileForm");

  if (f) f.reset();

  if ($("editingId")) {
    $("editingId").value = "";
  }

  if ($("formTitle")) {
    $("formTitle").textContent = "Add Profile";
  }

  if ($("saveButton")) {
    $("saveButton").textContent = "Save Profile";
  }

  if ($("photoPreview")) {
    $("photoPreview").src = "";
    $("photoPreview").hidden = true;
  }

  if ($("photoFileName")) {
    $("photoFileName").textContent =
      "No picture selected";
  }
}

function editProfile(id) {
  const p = profiles.find(x => x.id === id);

  if (!p || !canEdit(p)) return;

  if (!$("profileFormPanel")) {
    location.href =
      `profile.html?id=${encodeURIComponent(id)}&edit=1`;
    return;
  }

  $("editingId").value = p.id;
  $("fullName").value = p.fullName || "";
  $("dob").value = p.dob || "";
  $("rank").value = p.rank || "";
  $("gang").value = p.gang || "";

  if ($("photoPreview")) {
    if (p.photo) {
      $("photoPreview").src = p.photo;
      $("photoPreview").hidden = false;
    } else {
      $("photoPreview").src = "";
      $("photoPreview").hidden = true;
    }
  }

  if ($("photoFileName")) {
    $("photoFileName").textContent = p.photo
      ? "Current picture will be kept unless replaced"
      : "No picture selected";
  }

  $("formTitle").textContent = "Edit Profile";
  $("saveButton").textContent = "Update Profile";
  $("profileFormPanel").hidden = false;

  $("profileFormPanel").scrollIntoView({
    behavior: "smooth"
  });
}

async function deleteProfile(id) {
  const p = profiles.find(x => x.id === id);

  if (
    !p ||
    !isAdmin() ||
    !confirm(`Delete ${p.fullName}? This cannot be undone.`)
  ) {
    return;
  }

  try {
    await deleteDoc(doc(db, "profiles", id));

    profiles = profiles.filter(x => x.id !== id);

    renderDashboard();
    renderGroup();
  } catch (e) {
    alert(e.message);
  }
}


/* =========================================================
   IMAGE
   ========================================================= */

function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      return reject(
        new Error("Please choose an image file.")
      );
    }

    const reader = new FileReader();

    reader.onerror = () =>
      reject(new Error("Could not read image."));

    reader.onload = () => {
      const img = new Image();

      img.onerror = () =>
        reject(new Error("Could not process image."));

      img.onload = () => {
        const max = 512;

        let w = img.width;
        let h = img.height;

        if (w > h && w > max) {
          h = Math.round((h * max) / w);
          w = max;
        } else if (h >= w && h > max) {
          w = Math.round((w * max) / h);
          h = max;
        }

        const canvas =
          document.createElement("canvas");

        canvas.width = w;
        canvas.height = h;

        canvas
          .getContext("2d")
          .drawImage(img, 0, 0, w, h);

        let q = 0.82;

        let data =
          canvas.toDataURL("image/jpeg", q);

        while (
          data.length > 350000 &&
          q > 0.35
        ) {
          q -= 0.08;
          data =
            canvas.toDataURL("image/jpeg", q);
        }

        if (data.length > 350000) {
          return reject(
            new Error(
              "This image is still too large after compression. Please choose a smaller photo."
            )
          );
        }

        resolve(data);
      };

      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}


/* =========================================================
   EDITOR PERMISSIONS
   ========================================================= */

async function openEditorPermissions(id) {
  if (!isAdmin()) return;

  managingProfileId = id;

  const p = profiles.find(x => x.id === id);

  if (!p) return;

  await loadUsers();

  $("editorProfileName").textContent =
    `Choose which Editors may edit ${p.fullName}.`;

  const editors =
    directoryUsers.filter(
      u => u.role === "editor"
    );

  $("editorList").innerHTML = editors.length
    ? editors
        .map(
          u => `
            <label class="editor-row">
              <input
                type="checkbox"
                value="${u.id}"
                ${(p.editorIds || []).includes(u.id)
                  ? "checked"
                  : ""}
              >
              <span>
                <strong>${esc(
                  u.officerName || u.email
                )}</strong>
                <small>${esc(
                  u.email || ""
                )}</small>
              </span>
            </label>
          `
        )
        .join("")
    : `
        <p class="panel-copy">
          There are no accounts with the Editor role yet.
          Use Manage Users first.
        </p>
      `;

  $("editorPanel").hidden = false;

  $("editorPanel").scrollIntoView({
    behavior: "smooth"
  });
}

async function saveEditorPermissions() {
  if (!isAdmin() || !managingProfileId) return;

  const status = $("editorsStatus");

  try {
    const editorIds = [
      ...document.querySelectorAll(
        "#editorList input:checked"
      )
    ].map(i => i.value);

    await updateDoc(
      doc(db, "profiles", managingProfileId),
      {
        editorIds,
        lastEditedByUid: currentUser.uid,
        lastEditedByOfficerName:
          currentAccount.officerName,
        lastEditedAt: serverTimestamp()
      }
    );

    const p = profiles.find(
      x => x.id === managingProfileId
    );

    if (p) {
      p.editorIds = editorIds;
    }

    status.textContent =
      "Editor permissions saved.";

    status.className = "success";

    renderDashboard();
    renderGroup();
  } catch (e) {
    status.textContent =
      e.message ||
      "Could not save permissions.";

    status.className = "error";
  }
}


/* =========================================================
   USER MANAGEMENT
   ========================================================= */

async function renderUsers() {
  if (!isAdmin() || !$("usersList")) return;

  await loadUsers();

  $("usersList").innerHTML =
    directoryUsers
      .map(
        u => `
          <div class="user-row">
            <div>
              <strong>
                ${esc(
                  u.officerName ||
                  "Unnamed Officer"
                )}
              </strong>
              <small>
                ${esc(u.email || "")}
              </small>
            </div>

            <select
              class="role-select"
              data-id="${u.id}"
            >
              <option
                value="user"
                ${
                  u.role === "user"
                    ? "selected"
                    : ""
                }
              >
                User
              </option>

              <option
                value="editor"
                ${
                  u.role === "editor"
                    ? "selected"
                    : ""
                }
              >
                Editor
              </option>

              <option
                value="admin"
                ${
                  u.role === "admin"
                    ? "selected"
                    : ""
                }
              >
                Administrator
              </option>
            </select>
          </div>
        `
      )
      .join("");

  document
    .querySelectorAll(".role-select")
    .forEach(s => {
      s.onchange = () =>
        changeRole(
          s.dataset.id,
          s.value
        );
    });
}

async function changeRole(uid, roleValue) {
  const status = $("usersStatus");

  try {
    await updateDoc(
      doc(db, "users", uid),
      {
        role: roleValue,
        adminSetupCode: deleteField()
      }
    );

    const u = directoryUsers.find(
      x => x.id === uid
    );

    if (u) {
      u.role = roleValue;
    }

    status.textContent =
      "User role updated.";

    status.className = "success";

    if (uid === currentUser.uid) {
      currentAccount.role = roleValue;
      renderAccount();
    }
  } catch (e) {
    status.textContent =
      e.message ||
      "Could not update role.";

    status.className = "error";
  }
}


/* =========================================================
   PROFILE DETAILS
   ========================================================= */

async function saveProfileDetails(id) {
  const p = profiles.find(x => x.id === id);

  if (
    !p ||
    !currentUser ||
    !currentAccount
  ) {
    return;
  }

  const cautions = [
    ...document.querySelectorAll(
      "#detailCautions input:checked"
    )
  ].map(i => i.value);

  const notes =
    $("detailNotes")?.value.slice(0, 255) ||
    "";

  const status = $("detailStatus");

  try {
    if (status) {
      status.textContent =
        "Saving changes...";
      status.className = "";
    }

    await updateDoc(
      doc(db, "profiles", id),
      {
        cautions,
        notes,
        lastEditedByUid: currentUser.uid,
        lastEditedByOfficerName:
          currentAccount.officerName,
        lastEditedAt:
          serverTimestamp()
      }
    );

    p.cautions = cautions;
    p.notes = notes;
    p.lastEditedByUid =
      currentUser.uid;
    p.lastEditedByOfficerName =
      currentAccount.officerName;

    renderProfileDetail(p, false);

    if (status) {
      status.textContent =
        "Profile updated successfully.";
      status.className = "success";
    }
  } catch (e) {
    if (status) {
      status.textContent =
        e.message ||
        "Could not save profile.";
      status.className = "error";
    }
  }
}

function openProfilePhoto(p) {
  if (!p?.photo) return;

  let modal = $("profilePhotoModal");

  if (!modal) {
    modal =
      document.createElement("div");

    modal.id =
      "profilePhotoModal";

    modal.className =
      "profile-photo-modal";

    modal.innerHTML = `
      <div
        class="profile-photo-backdrop"
        data-close-photo
      ></div>

      <div
        class="profile-photo-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Enlarged profile photo"
      >
        <button
          type="button"
          class="profile-photo-close"
          aria-label="Close enlarged photo"
          data-close-photo
        >
          ×
        </button>

        <img
          id="profilePhotoLarge"
          class="profile-photo-large"
          alt=""
        >

        <div
          id="profilePhotoWatermark"
          class="profile-photo-watermark"
        ></div>
      </div>
    `;

    document.body.appendChild(modal);

    modal
      .querySelectorAll("[data-close-photo]")
      .forEach(el =>
        el.addEventListener(
          "click",
          closeProfilePhoto
        )
      );
  }

  const image =
    $("profilePhotoLarge");

  const watermark =
    $("profilePhotoWatermark");

  image.src = p.photo;
  image.alt =
    `Photo of ${p.fullName || "profile"}`;

  watermark.textContent =
    p.fullName || "";

  modal.hidden = false;

  document.body.classList.add(
    "photo-modal-open"
  );

  document.addEventListener(
    "keydown",
    handlePhotoModalKey
  );
}

function closeProfilePhoto() {
  const modal =
    $("profilePhotoModal");

  if (!modal) return;

  modal.hidden = true;

  document.body.classList.remove(
    "photo-modal-open"
  );

  document.removeEventListener(
    "keydown",
    handlePhotoModalKey
  );
}

function handlePhotoModalKey(e) {
  if (e.key === "Escape") {
    closeProfilePhoto();
  }
}

function renderProfileDetail(
  p,
  editing = false
) {
  const photo =
    $("detailPhoto");

  if (photo) {
    if (p.photo) {
      photo.src = p.photo;
      photo.hidden = false;

      photo.onclick = () =>
        openProfilePhoto(p);

      photo.setAttribute(
        "role",
        "button"
      );

      photo.setAttribute(
        "tabindex",
        "0"
      );

      photo.setAttribute(
        "aria-label",
        `Enlarge photo of ${
          p.fullName || "profile"
        }`
      );

      photo.onkeydown = e => {
        if (
          e.key === "Enter" ||
          e.key === " "
        ) {
          e.preventDefault();
          openProfilePhoto(p);
        }
      };
    } else {
      photo.removeAttribute("src");
      photo.hidden = true;
      photo.onclick = null;
      photo.removeAttribute("role");
      photo.removeAttribute("tabindex");
    }
  }

  if ($("detailName")) {
    $("detailName").textContent =
      p.fullName || "";
  }

  if ($("detailRank")) {
    $("detailRank").textContent =
      p.rank || "";
  }

  if ($("detailDob")) {
    $("detailDob").textContent =
      `D.O.B: ${formatDate(p.dob)}`;
  }

  if ($("detailAddress")) {
    $("detailAddress").textContent =
      p.address
        ? `Address: ${p.address}`
        : "Address: Not provided";
  }

  if ($("detailGang")) {
    $("detailGang").textContent =
      p.gang || "";
  }

  const selected =
    new Set(p.cautions || []);

  const box =
    $("detailCautions");

  if (box) {
    box.innerHTML =
      CAUTIONS.map(
        c => `
          <label class="caution-row">
            <input
              type="checkbox"
              value="${esc(c)}"
              ${
                selected.has(c)
                  ? "checked"
                  : ""
              }
              ${
                editing
                  ? ""
                  : "disabled"
              }
            >
            <span>${esc(c)}</span>
          </label>
        `
      ).join("");
  }

  const notes =
    $("detailNotes");

  if (notes) {
    notes.value =
      p.notes || "";

    notes.readOnly =
      !editing;

    notes.maxLength = 255;
  }

  const counter =
    $("notesCounter");

  if (counter) {
    counter.textContent =
      `${(p.notes || "").length} / 255`;
  }

  const editBtn =
    $("detailEditButton");

  const saveBtn =
    $("detailSaveButton");

  const cancelBtn =
    $("detailCancelButton");

  if (editBtn) {
    editBtn.hidden =
      editing || !currentUser;

    editBtn.onclick = () =>
      renderProfileDetail(
        p,
        true
      );
  }

  if (saveBtn) {
    saveBtn.hidden =
      !editing;

    saveBtn.onclick = () =>
      saveProfileDetails(p.id);
  }

  if (cancelBtn) {
    cancelBtn.hidden =
      !editing;

    cancelBtn.onclick = () =>
      renderProfileDetail(
        p,
        false
      );
  }

  const del =
    $("detailDeleteButton");

  if (del) {
    del.hidden =
      !isAdmin();

    del.onclick = () =>
      deleteProfileFromDetail(
        p.id
      );
  }

  const perm =
    $("detailPermissionsButton");

  if (perm) {
    perm.hidden =
      !isAdmin();

    perm.onclick = () =>
      openEditorPermissionsFromDetail(
        p
      );
  }

  if (notes) {
    notes.oninput = () => {
      if (counter) {
        counter.textContent =
          `${notes.value.length} / 255`;
      }
    };
  }

  const editPhotoNote =
    $("detailEditHint");

  if (editPhotoNote) {
    editPhotoNote.hidden =
      !editing;
  }
}

async function deleteProfileFromDetail(id) {
  const p = profiles.find(
    x => x.id === id
  );

  if (
    !p ||
    !isAdmin() ||
    !confirm(
      `Delete ${p.fullName}? This cannot be undone.`
    )
  ) {
    return;
  }

  try {
    await deleteDoc(
      doc(db, "profiles", id)
    );

    location.href =
      "index.html";
  } catch (e) {
    const s =
      $("detailStatus");

    if (s) {
      s.textContent =
        e.message;

      s.className =
        "error";
    }
  }
}

async function openEditorPermissionsFromDetail(
  p
) {
  if (!isAdmin()) return;

  await openEditorPermissions(
    p.id
  );
}

async function setupProfileDetail() {
  const id =
    new URLSearchParams(
      location.search
    ).get("id");

  if (!id) return;

  await loadProfiles();

  const p =
    profiles.find(
      x => x.id === id
    );

  if (!p) {
    if ($("detailStatus")) {
      $("detailStatus").textContent =
        "Profile not found.";
    }

    return;
  }

  if ($("backButton")) {
    $("backButton").onclick =
      () =>
        history.length > 1
          ? history.back()
          : (location.href =
              "index.html");
  }

  if (
    $("detailPermissionsButton")
  ) {
    $("detailPermissionsButton")
      .hidden = !isAdmin();
  }

  renderProfileDetail(
    p,
    new URLSearchParams(
      location.search
    ).get("edit") === "1" &&
      canEdit(p)
  );
}


/* =========================================================
   LOGIN / LOGOUT
   ========================================================= */

function setupLogout() {
  const b =
    $("logoutButton");

  if (b) {
    b.onclick = async () => {
      await signOut(auth);
      location.href =
        "login.html";
    };
  }
}

function setupLogin() {
  const f =
    $("loginForm");

  if (!f) return;

  f.onsubmit = async e => {
    e.preventDefault();

    const status =
      $("loginStatus");

    try {
      await signInWithEmailAndPassword(
        auth,
        $("email").value.trim(),
        $("password").value
      );

      status.textContent =
        "Signed in successfully.";

      status.className =
        "success";
    } catch (err) {
      status.textContent =
        err.message.replace(
          "Firebase: ",
          ""
        );

      status.className =
        "error";
    }
  };
}


/* =========================================================
   REGISTRATION
   ========================================================= */

function setupRegister() {
  const f =
    $("registerForm");

  if (!f) return;

  f.onsubmit = async e => {
    e.preventDefault();

    const status =
      $("registerStatus");

    const officerNameInput = $("officerName");

console.log("OFFICER NAME INPUT:", officerNameInput);
console.log("OFFICER NAME VALUE:", officerNameInput?.value);

const officerName = officerNameInput?.value.trim() || "";

    const email =
      $("email")
        .value
        .trim();

    const password =
      $("password")
        .value;

    const confirmPassword =
      $("confirmPassword")
        .value;

    const code =
      $("adminSetupCode")
        .value;

    let credential = null;

    if (
      password !==
      confirmPassword
    ) {
      status.textContent =
        "Passwords do not match.";

      status.className =
        "error";

      return;
    }

    if (!officerName) {
      status.textContent =
        "Officer Name is required.";

      status.className =
        "error";

      return;
    }

    try {
      /*
       * STEP 1:
       * Create the Firebase Authentication account.
       */
      credential =
        await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

      /*
       * STEP 2:
       * Save the Officer Name in Firebase Authentication.
       *
       * This is important for existing-user recovery
       * through loadAccount().
       */
      await updateProfile(
        credential.user,
        {
          displayName:
            officerName
        }
      );

      /*
       * STEP 3:
       * Create the matching Firestore users/{UID}
       * document.
       */
      console.log("OFFICER NAME ENTERED:", officerName);
      console.log("AUTH DISPLAY NAME:", credential.user.displayName);
      const uid =
        credential.user.uid;

      const userRef =
        doc(
          db,
          "users",
          uid
        );

      /*
       * INITIAL ADMINISTRATOR SETUP
       */
      if (code) {
        const batch =
          writeBatch(db);

        batch.set(
          userRef,
          {
            officerName,
            email,
            role: "admin",
            adminSetupCode: code,
            createdAt:
              serverTimestamp()
          }
        );

        batch.update(
          doc(
            db,
            "system",
            "bootstrap"
          ),
          {
            enabled: false
          }
        );

        await batch.commit();

        /*
         * Remove the secret setup code immediately
         * after the administrator account is created.
         */
        await updateDoc(
          userRef,
          {
            adminSetupCode:
              deleteField()
          }
        );
      } else {
        /*
         * NORMAL USER
         */
        await setDoc(
          userRef,
          {
            officerName,
            email,
            role: "user",
            createdAt:
              serverTimestamp()
          }
        );
      }

      status.textContent =
        "Account created successfully.";

      status.className =
        "success";

      setTimeout(
        () => {
          location.href =
            "index.html";
        },
        500
      );
    } catch (err) {
      /*
       * If Firestore registration fails after
       * Authentication was created, remove the
       * Authentication account so we don't leave
       * an incomplete account behind.
       */
      if (credential?.user) {
        try {
          await deleteUser(
            credential.user
          );
        } catch (_) {}
      }

      status.textContent =
        err.message.replace(
          "Firebase: ",
          ""
        );

      status.className =
        "error";
    }
  };
}


/* =========================================================
   PWA
   ========================================================= */

function setupPWA() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .catch(() => {});
  }
}


/* =========================================================
   DASHBOARD
   ========================================================= */

function setupDashboard() {
  const form =
    $("profileForm");

  if (!form) return;

  $("showAddProfile").onclick =
    () => {
      resetForm();

      $("profileFormPanel").hidden =
        false;

      $("profileFormPanel")
        .scrollIntoView({
          behavior: "smooth"
        });
    };

  $("closeFormButton").onclick =
    () =>
      ($("profileFormPanel").hidden =
        true);

  $("cancelEditButton").onclick =
    resetForm;

  $("showUsersButton")
    ?.addEventListener(
      "click",
      async () => {
        await renderUsers();

        $("userManagementPanel")
          .hidden = false;

        $("userManagementPanel")
          .scrollIntoView({
            behavior: "smooth"
          });
      }
    );

  const photoInput =
    $("photo");

  const cameraInput =
    $("cameraPhoto");

  const chooseInput =
    $("choosePhoto");

  const usePhoto = file => {
    if (!file) return;

    const dt =
      new DataTransfer();

    dt.items.add(file);

    photoInput.files =
      dt.files;

    const r =
      new FileReader();

    r.onload = () => {
      if ($("photoPreview")) {
        $("photoPreview").src =
          r.result;

        $("photoPreview").hidden =
          false;
      }

      if ($("photoFileName")) {
        $("photoFileName")
          .textContent =
          file.name ||
          "Picture selected";
      }
    };

    r.readAsDataURL(file);
  };

  cameraInput?.addEventListener(
    "change",
    () =>
      usePhoto(
        cameraInput.files[0]
      )
  );

  chooseInput?.addEventListener(
    "change",
    () =>
      usePhoto(
        chooseInput.files[0]
      )
  );

  photoInput?.addEventListener(
    "change",
    () =>
      usePhoto(
        photoInput.files[0]
      )
  );

  $("takePhotoButton")
    ?.addEventListener(
      "click",
      () =>
        cameraInput?.click()
    );

  $("choosePhotoButton")
    ?.addEventListener(
      "click",
      () =>
        chooseInput?.click()
    );

  $("closeUsersButton")
    ?.addEventListener(
      "click",
      () =>
        ($("userManagementPanel")
          .hidden = true)
    );

  $("closeEditorsButton")
    ?.addEventListener(
      "click",
      () =>
        ($("editorPanel")
          .hidden = true)
    );

  $("saveEditorsButton")
    ?.addEventListener(
      "click",
      saveEditorPermissions
    );

  form.onsubmit =
    async e => {
      e.preventDefault();

      const id =
        $("editingId").value ||
        crypto.randomUUID();

      const old =
        profiles.find(
          x => x.id === id
        );

      if (
        old &&
        !canEdit(old)
      ) {
        return;
      }

      let photo =
        old?.photo || "";

      const file =
        $("photo").files[0];

      const status =
        $("status");

      try {
        status.textContent =
          "Saving profile...";

        status.className =
          "";

        if (file) {
          photo =
            await compressImage(
              file
            );
        }

        const p = {
          fullName:
            $("fullName")
              .value
              .trim(),

          dob:
            $("dob").value,

          address:
            $("address")
              .value
              .trim(),

          rank:
            $("rank").value,

          gang:
            $("gang").value,

          photo,

          cautions:
            old?.cautions || [],

          notes:
            old?.notes || "",

          createdAtMs:
            old?.createdAtMs ||
            Date.now(),

          createdByUid:
            old?.createdByUid ||
            currentUser.uid,

          createdByOfficerName:
            old?.createdByOfficerName ||
            currentAccount.officerName,

          editorIds:
            old?.editorIds || [],

          lastEditedByUid:
            currentUser.uid,

          lastEditedByOfficerName:
            currentAccount.officerName,

          lastEditedAt:
            serverTimestamp()
        };

        await setDoc(
          doc(
            db,
            "profiles",
            id
          ),
          p,
          {
            merge: true
          }
        );

        const saved = {
          id,
          ...p
        };

        const i =
          profiles.findIndex(
            x => x.id === id
          );

        if (i >= 0) {
          profiles[i] =
            saved;
        } else {
          profiles.push(
            saved
          );
        }

        status.textContent =
          i >= 0
            ? "Profile updated successfully."
            : "Profile added successfully.";

        status.className =
          "success";

        resetForm();

        renderDashboard();
      } catch (err) {
        status.textContent =
          err.message ||
          "Could not save profile.";

        status.className =
          "error";
      }
    };

  [
    "searchInput",
    "filterRank",
    "sortSelect"
  ].forEach(id =>
    $(id)?.addEventListener(
      "input",
      renderDashboard
    )
  );

  $("filterRank")
    ?.addEventListener(
      "change",
      renderDashboard
    );

  $("sortSelect")
    ?.addEventListener(
      "change",
      renderDashboard
    );

  $("exportButton").onclick =
    () => {
      const blob =
        new Blob(
          [
            JSON.stringify(
              profiles,
              null,
              2
            )
          ],
          {
            type:
              "application/json"
          }
        );

      const a =
        document.createElement(
          "a"
        );

      a.href =
        URL.createObjectURL(
          blob
        );

      a.download =
        "rogue-gallery-backup.json";

      a.click();

      URL.revokeObjectURL(
        a.href
      );
    };

  $("importInput").onchange =
    async e => {
      const status =
        $("backupStatus");

      try {
        const data =
          JSON.parse(
            await e.target.files[0].text()
          );

        if (!Array.isArray(data)) {
          throw new Error(
            "Invalid backup file."
          );
        }

        for (const raw of data) {
          const id =
            crypto.randomUUID();

          const p = {
            fullName:
              raw.fullName ||
              "",

            dob:
              raw.dob || "",

            address:
              raw.address ||
              "",

            rank:
              raw.rank ||
              "Associate",

            gang:
              raw.gang ||
              GANGS[0],

            photo:
              raw.photo ||
              "",

            cautions:
              Array.isArray(
                raw.cautions
              )
                ? raw.cautions
                : [],

            notes:
              typeof raw.notes ===
              "string"
                ? raw.notes.slice(
                    0,
                    255
                  )
                : "",

            createdAtMs:
              Date.now(),

            createdByUid:
              currentUser.uid,

            createdByOfficerName:
              currentAccount.officerName,

            editorIds: [],

            lastEditedByUid:
              currentUser.uid,

            lastEditedByOfficerName:
              currentAccount.officerName,

            lastEditedAt:
              serverTimestamp()
          };

          await setDoc(
            doc(
              db,
              "profiles",
              id
            ),
            p
          );
        }

        await loadProfiles();

        renderDashboard();

        status.textContent =
          "Backup imported successfully.";

        status.className =
          "success";
      } catch (err) {
        status.textContent =
          err.message ||
          "Could not import this backup.";

        status.className =
          "error";
      } finally {
        e.target.value = "";
      }
    };
}


/* =========================================================
   BOOT
   ========================================================= */

async function boot() {
  setupPWA();
  nav();
  setupLogin();
  setupRegister();
  setupLogout();
  setupDashboard();

  onAuthStateChanged(
    auth,
    async user => {
      const page =
        location.pathname
          .split("/")
          .pop() ||
        "index.html";

      const privatePages = [
        "index.html",
        "group.html",
        "profile.html",
        ""
      ];

      if (user) {
        currentUser =
          user;

        if (
          page === "login.html" ||
          page === "register.html"
        ) {
          location.replace(
            "index.html"
          );

          return;
        }

        try {
          /*
           * Loads the existing Firestore account,
           * or automatically creates one if this
           * Firebase Auth user does not have one yet.
           */
          await loadAccount();

          if (
            page ===
            "profile.html"
          ) {
            await setupProfileDetail();
          } else {
            await loadProfiles();

            if (
              isAdmin() &&
              $("showUsersButton")
            ) {
              $("showUsersButton")
                .hidden = false;
            }

            renderDashboard();
            renderGroup();
          }
        } catch (e) {
          const msg =
            $("status") ||
            $("backupStatus") ||
            $("registerStatus");

          if (msg) {
            msg.textContent =
              "Could not load directory account: " +
              e.message;

            msg.className =
              "error";
          }
        }
      } else if (
        privatePages.includes(page)
      ) {
        location.href =
          "login.html";
      }
    }
  );
}

document.addEventListener(
  "DOMContentLoaded",
  boot
);
```
