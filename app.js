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


/* =========================================================
   ROGUE GALLERY
   Global configuration
========================================================= */

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


/* =========================================================
   GLOBAL STATE
========================================================= */

let profiles = [];
let currentUser = null;
let currentAccount = null;
let directoryUsers = [];
let managingProfileId = null;

/*
  IMPORTANT:
  Firebase automatically signs a user in immediately after
  createUserWithEmailAndPassword() succeeds.

  This flag prevents onAuthStateChanged() from trying to load
  the account before registration has finished writing the
  users/{uid} Firestore document.
*/
let registrationInProgress = false;


/* =========================================================
   HELPERS
========================================================= */

const $ = id => document.getElementById(id);

const rankIndex = rank => {
  const index = RANKS.indexOf(rank);
  return index < 0 ? 999 : index;
};

const esc = value => {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
};

const formatDate = value => {
  if (!value) return "";

  return new Date(
    value + "T00:00:00"
  ).toLocaleDateString(
    undefined,
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );
};

const profileCollection = () =>
  collection(db, "profiles");

const canEdit = profile =>
  currentAccount &&
  (
    currentAccount.role === "admin" ||
    profile.createdByUid === currentUser.uid ||
    (profile.editorIds || []).includes(currentUser.uid)
  );

const isAdmin = () =>
  currentAccount?.role === "admin";


/* =========================================================
   PWA
========================================================= */

function setupPWA() {
  if (
    "serviceWorker" in navigator &&
    location.protocol !== "file:"
  ) {
    navigator.serviceWorker
      .register("./sw.js")
      .catch(() => {});
  }
}


/* =========================================================
   NAVIGATION
========================================================= */

function nav() {
  const container = $("gangNavigation");

  if (!container) return;

  const current =
    new URLSearchParams(location.search).get("gang");

  container.innerHTML = GANGS
    .map(
      gang =>
        `
        <a
          class="nav-item gang-link ${current === gang ? "active" : ""}"
          href="group.html?gang=${encodeURIComponent(gang)}"
        >
          ${esc(gang)}
        </a>
        `
    )
    .join("");
}


/* =========================================================
   ACCOUNT DISPLAY
========================================================= */

function renderAccount() {
  if ($("officerDisplay")) {
    $("officerDisplay").textContent =
      currentAccount?.officerName ||
      currentUser?.displayName ||
      currentUser?.email ||
      "";
  }

  if ($("roleDisplay")) {
    $("roleDisplay").textContent =
      (
        currentAccount?.role ||
        "user"
      ).toUpperCase();
  }
}


/* =========================================================
   PROFILE CARD
========================================================= */

function card(profile) {
  const image = profile.photo
    ? `
      <img
        class="profile-image"
        src="${profile.photo}"
        alt="Photo of ${esc(profile.fullName)}"
      >
    `
    : `
      <div
        class="profile-image"
        aria-label="No profile photo"
      ></div>
    `;

  const actions = [];

  if (canEdit(profile)) {
    actions.push(
      `
      <button
        class="primary-button edit-profile"
        data-id="${profile.id}"
        type="button"
      >
        ✎ Edit
      </button>
      `
    );
  }

  if (isAdmin()) {
    actions.push(
      `
      <button
        class="secondary-button editors-profile"
        data-id="${profile.id}"
        type="button"
      >
        Permissions
      </button>
      `
    );

    actions.push(
      `
      <button
        class="danger-button delete-profile"
        data-id="${profile.id}"
        type="button"
      >
        🗑 Delete
      </button>
      `
    );
  }

  const audit =
    profile.createdByOfficerName
      ? `
        <p class="audit-line">
          Added by ${esc(profile.createdByOfficerName)}
          ${
            profile.lastEditedByOfficerName
              ? ` · Edited by ${esc(profile.lastEditedByOfficerName)}`
              : ""
          }
        </p>
      `
      : "";

  return `
    <article class="profile-card">

      <div class="card-top">
        ${image}

        <span class="rank-badge">
          ${esc(profile.rank)}
        </span>
      </div>

      <h3>
        ${esc(profile.fullName)}
      </h3>

      <p>
        ▣ D.O.B:
        ${esc(formatDate(profile.dob))}
      </p>

      <p>
        ♙ Rank:
        ${esc(profile.rank)}
      </p>

      <p>
        ♛ Gang:
        ${esc(profile.gang)}
      </p>

      ${audit}

      ${
        actions.length
          ? `
            <div class="card-actions">
              ${actions.join("")}
            </div>
          `
          : ""
      }

    </article>
  `;
}


/* =========================================================
   PROFILE CARD BUTTONS
========================================================= */

function bindCards() {
  document
    .querySelectorAll(".edit-profile")
    .forEach(button => {
      button.onclick = () =>
        editProfile(button.dataset.id);
    });

  document
    .querySelectorAll(".delete-profile")
    .forEach(button => {
      button.onclick = () =>
        deleteProfile(button.dataset.id);
    });

  document
    .querySelectorAll(".editors-profile")
    .forEach(button => {
      button.onclick = () =>
        openEditorPermissions(button.dataset.id);
    });
}


/* =========================================================
   SORTING
========================================================= */

function sorted(list, sort = "rank") {
  const result = [...list];

  if (sort === "name") {
    return result.sort(
      (a, b) =>
        (a.fullName || "").localeCompare(
          b.fullName || ""
        )
    );
  }

  if (sort === "newest") {
    return result.sort(
      (a, b) =>
        (b.createdAtMs || 0) -
        (a.createdAtMs || 0)
    );
  }

  return result.sort(
    (a, b) =>
      rankIndex(a.rank) -
        rankIndex(b.rank) ||
      (a.fullName || "").localeCompare(
        b.fullName || ""
      )
  );
}


/* =========================================================
   LOAD CURRENT ACCOUNT
========================================================= */

async function loadAccount() {
  if (!currentUser) {
    throw new Error(
      "No authenticated user was found."
    );
  }

  const userRef =
    doc(
      db,
      "users",
      currentUser.uid
    );

  const snapshot =
    await getDoc(userRef);

  /*
    If an Auth account already exists but the Firestore
    users document does not, create it automatically.

    This is especially useful for your existing Firebase
    Authentication users.
  */
  if (!snapshot.exists()) {
    const officerName =
      currentUser.displayName ||
      currentUser.email ||
      "Unnamed Officer";

    const email =
      currentUser.email || "";

    await setDoc(
      userRef,
      {
        officerName,
        email,
        role: "user",
        createdAt: serverTimestamp()
      }
    );

    currentAccount = {
      officerName,
      email,
      role: "user"
    };
  } else {
    currentAccount =
      snapshot.data();

    /*
      If the Firestore document exists but officerName is
      empty, repair it from Firebase Authentication.
    */
    if (
      !currentAccount.officerName &&
      currentUser.displayName
    ) {
      await updateDoc(
        userRef,
        {
          officerName:
            currentUser.displayName
        }
      );

      currentAccount.officerName =
        currentUser.displayName;
    }

    /*
      If officerName is still empty, use the email as a
      last-resort fallback and save it.
    */
    if (
      !currentAccount.officerName &&
      currentUser.email
    ) {
      await updateDoc(
        userRef,
        {
          officerName:
            currentUser.email
        }
      );

      currentAccount.officerName =
        currentUser.email;
    }
  }

  renderAccount();
}


/* =========================================================
   LOAD PROFILES
========================================================= */

async function loadProfiles() {
  const snapshot =
    await getDocs(
      profileCollection()
    );

  profiles =
    snapshot.docs.map(
      document => ({
        id: document.id,
        ...document.data()
      })
    );
}


/* =========================================================
   LOAD USERS
========================================================= */

async function loadUsers() {
  if (!isAdmin()) return;

  const snapshot =
    await getDocs(
      collection(db, "users")
    );

  directoryUsers =
    snapshot.docs
      .map(
        document => ({
          id: document.id,
          ...document.data()
        })
      )
      .sort(
        (a, b) =>
          (a.officerName || "")
            .localeCompare(
              b.officerName || ""
            )
      );
}


/* =========================================================
   DASHBOARD RENDER
========================================================= */

function renderDashboard() {
  const container =
    $("profiles");

  if (!container) return;

  const search =
    $("searchInput")
      ?.value
      .toLowerCase() || "";

  const filter =
    $("filterRank")?.value || "";

  const sort =
    $("sortSelect")?.value || "rank";

  const list =
    sorted(
      profiles.filter(
        profile =>
          (profile.fullName || "")
            .toLowerCase()
            .includes(search) &&
          (
            !filter ||
            profile.rank === filter
          )
      ),
      sort
    );

  container.innerHTML =
    list
      .map(card)
      .join("");

  if ($("emptyMessage")) {
    $("emptyMessage").hidden =
      list.length > 0;
  }

  bindCards();
}


/* =========================================================
   GROUP PAGE RENDER
========================================================= */

function renderGroup() {
  const title =
    $("gangTitle");

  if (!title) return;

  const gang =
    new URLSearchParams(
      location.search
    ).get("gang") ||
    GANGS[0];

  title.textContent =
    gang;

  const list =
    sorted(
      profiles.filter(
        profile =>
          profile.gang === gang
      )
    );

  if ($("profiles")) {
    $("profiles").innerHTML =
      list
        .map(card)
        .join("");
  }

  if ($("emptyMessage")) {
    $("emptyMessage").hidden =
      list.length > 0;
  }

  bindCards();
}


/* =========================================================
   RESET PROFILE FORM
========================================================= */

function resetForm() {
  const form =
    $("profileForm");

  if (form) {
    form.reset();
  }

  if ($("editingId")) {
    $("editingId").value = "";
  }

  if ($("formTitle")) {
    $("formTitle").textContent =
      "Add Profile";
  }

  if ($("saveButton")) {
    $("saveButton").textContent =
      "Save Profile";
  }
}


/* =========================================================
   EDIT PROFILE
========================================================= */

function editProfile(id) {
  const profile =
    profiles.find(
      item => item.id === id
    );

  if (
    !profile ||
    !canEdit(profile)
  ) {
    return;
  }

  if (!$("profileFormPanel")) {
    location.href =
      "index.html";

    return;
  }

  $("editingId").value =
    profile.id;

  $("fullName").value =
    profile.fullName || "";

  $("dob").value =
    profile.dob || "";

  $("rank").value =
    profile.rank || "";

  $("gang").value =
    profile.gang || "";

  if ($("formTitle")) {
    $("formTitle").textContent =
      "Edit Profile";
  }

  if ($("saveButton")) {
    $("saveButton").textContent =
      "Update Profile";
  }

  $("profileFormPanel").hidden =
    false;

  $("profileFormPanel")
    .scrollIntoView({
      behavior: "smooth"
    });
}


/* =========================================================
   DELETE PROFILE
========================================================= */

async function deleteProfile(id) {
  const profile =
    profiles.find(
      item => item.id === id
    );

  if (
    !profile ||
    !isAdmin()
  ) {
    return;
  }

  if (
    !confirm(
      `Delete ${profile.fullName}? This cannot be undone.`
    )
  ) {
    return;
  }

  try {
    await deleteDoc(
      doc(
        db,
        "profiles",
        id
      )
    );

    profiles =
      profiles.filter(
        item => item.id !== id
      );

    renderDashboard();
    renderGroup();
  } catch (error) {
    alert(
      error.message ||
      "Could not delete profile."
    );
  }
}


/* =========================================================
   COMPRESS PROFILE IMAGE
========================================================= */

function compressImage(file) {
  return new Promise(
    (resolve, reject) => {
      if (
        !file.type.startsWith(
          "image/"
        )
      ) {
        reject(
          new Error(
            "Please choose an image file."
          )
        );

        return;
      }

      const reader =
        new FileReader();

      reader.onerror = () =>
        reject(
          new Error(
            "Could not read image."
          )
        );

      reader.onload = () => {
        const image =
          new Image();

        image.onerror = () =>
          reject(
            new Error(
              "Could not process image."
            )
          );

        image.onload = () => {
          const max = 512;

          let width =
            image.width;

          let height =
            image.height;

          if (
            width > height &&
            width > max
          ) {
            height =
              Math.round(
                height *
                max /
                width
              );

            width = max;
          } else if (
            height >= width &&
            height > max
          ) {
            width =
              Math.round(
                width *
                max /
                height
              );

            height = max;
          }

          const canvas =
            document.createElement(
              "canvas"
            );

          canvas.width =
            width;

          canvas.height =
            height;

          const context =
            canvas.getContext(
              "2d"
            );

          context.drawImage(
            image,
            0,
            0,
            width,
            height
          );

          let quality = 0.82;

          let data =
            canvas.toDataURL(
              "image/jpeg",
              quality
            );

          while (
            data.length > 350000 &&
            quality > 0.35
          ) {
            quality -= 0.08;

            data =
              canvas.toDataURL(
                "image/jpeg",
                quality
              );
          }

          if (
            data.length > 350000
          ) {
            reject(
              new Error(
                "This image is still too large after compression. Please choose a smaller photo."
              )
            );

            return;
          }

          resolve(data);
        };

        image.src =
          reader.result;
      };

      reader.readAsDataURL(file);
    }
  );
}


/* =========================================================
   EDITOR PERMISSIONS
========================================================= */

async function openEditorPermissions(id) {
  if (!isAdmin()) return;

  managingProfileId =
    id;

  const profile =
    profiles.find(
      item => item.id === id
    );

  if (!profile) return;

  await loadUsers();

  if ($("editorProfileName")) {
    $("editorProfileName").textContent =
      `Choose which Editors may edit ${profile.fullName}.`;
  }

  const editors =
    directoryUsers.filter(
      user =>
        user.role === "editor"
    );

  if ($("editorList")) {
    $("editorList").innerHTML =
      editors.length
        ? editors
            .map(
              user =>
                `
                <label class="editor-row">

                  <input
                    type="checkbox"
                    value="${user.id}"
                    ${
                      (profile.editorIds || [])
                        .includes(user.id)
                        ? "checked"
                        : ""
                    }
                  >

                  <span>
                    <strong>
                      ${esc(
                        user.officerName ||
                        user.email
                      )}
                    </strong>

                    <small>
                      ${esc(
                        user.email || ""
                      )}
                    </small>
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
  }

  if ($("editorPanel")) {
    $("editorPanel").hidden =
      false;

    $("editorPanel")
      .scrollIntoView({
        behavior: "smooth"
      });
  }
}


/* =========================================================
   SAVE EDITOR PERMISSIONS
========================================================= */

async function saveEditorPermissions() {
  if (
    !isAdmin() ||
    !managingProfileId
  ) {
    return;
  }

  const status =
    $("editorsStatus");

  try {
    const editorIds =
      [
        ...document.querySelectorAll(
          "#editorList input:checked"
        )
      ].map(
        input =>
          input.value
      );

    await updateDoc(
      doc(
        db,
        "profiles",
        managingProfileId
      ),
      {
        editorIds,
        lastEditedByUid:
          currentUser.uid,
        lastEditedByOfficerName:
          currentAccount.officerName,
        lastEditedAt:
          serverTimestamp()
      }
    );

    const profile =
      profiles.find(
        item =>
          item.id ===
          managingProfileId
      );

    if (profile) {
      profile.editorIds =
        editorIds;
    }

    if (status) {
      status.textContent =
        "Editor permissions saved.";

      status.className =
        "success";
    }

    renderDashboard();
    renderGroup();

  } catch (error) {
    if (status) {
      status.textContent =
        error.message ||
        "Could not save permissions.";

      status.className =
        "error";
    }
  }
}


/* =========================================================
   USER MANAGEMENT
========================================================= */

async function renderUsers() {
  if (
    !isAdmin() ||
    !$("usersList")
  ) {
    return;
  }

  await loadUsers();

  $("usersList").innerHTML =
    directoryUsers
      .map(
        user =>
          `
          <div class="user-row">

            <div>
              <strong>
                ${esc(
                  user.officerName ||
                  "Unnamed Officer"
                )}
              </strong>

              <small>
                ${esc(
                  user.email || ""
                )}
              </small>
            </div>

            <select
              class="role-select"
              data-id="${user.id}"
            >

              <option
                value="user"
                ${
                  user.role === "user"
                    ? "selected"
                    : ""
                }
              >
                User
              </option>

              <option
                value="editor"
                ${
                  user.role === "editor"
                    ? "selected"
                    : ""
                }
              >
                Editor
              </option>

              <option
                value="admin"
                ${
                  user.role === "admin"
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
    .querySelectorAll(
      ".role-select"
    )
    .forEach(select => {
      select.onchange = () =>
        changeRole(
          select.dataset.id,
          select.value
        );
    });
}


/* =========================================================
   CHANGE USER ROLE
========================================================= */

async function changeRole(
  uid,
  roleValue
) {
  const status =
    $("usersStatus");

  try {
    /*
      Do not store the administrator setup code.
      Role changes simply update the role field.
    */
    await updateDoc(
      doc(
        db,
        "users",
        uid
      ),
      {
        role: roleValue
      }
    );

    const user =
      directoryUsers.find(
        item =>
          item.id === uid
      );

    if (user) {
      user.role =
        roleValue;
    }

    if (status) {
      status.textContent =
        "User role updated.";

      status.className =
        "success";
    }

    /*
      If the currently logged-in user changes their own
      role, update the local account immediately.
    */
    if (
      uid === currentUser.uid
    ) {
      currentAccount.role =
        roleValue;

      renderAccount();
    }

  } catch (error) {
    if (status) {
      status.textContent =
        error.message ||
        "Could not update role.";

      status.className =
        "error";
    }
  }
}


/* =========================================================
   LOGOUT
========================================================= */

function setupLogout() {
  const button =
    $("logoutButton");

  if (!button) return;

  button.onclick =
    async () => {
      try {
        await signOut(auth);
      } finally {
        location.href =
          "login.html";
      }
    };
}


/* =========================================================
   DASHBOARD SETUP
========================================================= */

function setupDashboard() {
  const form =
    $("profileForm");

  if (!form) return;


  /* -----------------------------------------
     ADD PROFILE
  ----------------------------------------- */

  $("showAddProfile")?.addEventListener(
    "click",
    () => {
      resetForm();

      if ($("profileFormPanel")) {
        $("profileFormPanel").hidden =
          false;

        $("profileFormPanel")
          .scrollIntoView({
            behavior: "smooth"
          });
      }
    }
  );


  /* -----------------------------------------
     CLOSE PROFILE FORM
  ----------------------------------------- */

  $("closeFormButton")?.addEventListener(
    "click",
    () => {
      if ($("profileFormPanel")) {
        $("profileFormPanel").hidden =
          true;
      }
    }
  );


  /* -----------------------------------------
     CANCEL EDIT
  ----------------------------------------- */

  $("cancelEditButton")?.addEventListener(
    "click",
    resetForm
  );


  /* -----------------------------------------
     MANAGE USERS
  ----------------------------------------- */

  $("showUsersButton")?.addEventListener(
    "click",
    async () => {
      await renderUsers();

      if ($("userManagementPanel")) {
        $("userManagementPanel").hidden =
          false;

        $("userManagementPanel")
          .scrollIntoView({
            behavior: "smooth"
          });
      }
    }
  );


  /* -----------------------------------------
     CLOSE USER MANAGEMENT
  ----------------------------------------- */

  $("closeUsersButton")?.addEventListener(
    "click",
    () => {
      if ($("userManagementPanel")) {
        $("userManagementPanel").hidden =
          true;
      }
    }
  );


  /* -----------------------------------------
     CLOSE EDITOR PANEL
  ----------------------------------------- */

  $("closeEditorsButton")?.addEventListener(
    "click",
    () => {
      if ($("editorPanel")) {
        $("editorPanel").hidden =
          true;
      }
    }
  );


  /* -----------------------------------------
     SAVE EDITOR PERMISSIONS
  ----------------------------------------- */

  $("saveEditorsButton")?.addEventListener(
    "click",
    saveEditorPermissions
  );


  /* =======================================================
     PROFILE FORM SUBMIT
  ======================================================= */

  form.onsubmit =
    async event => {
      event.preventDefault();

      const id =
        $("editingId")?.value ||
        crypto.randomUUID();

      const oldProfile =
        profiles.find(
          profile =>
            profile.id === id
        );

      /*
        Existing profile:
        make sure the current user is allowed to edit it.
      */
      if (
        oldProfile &&
        !canEdit(oldProfile)
      ) {
        return;
      }

      let photo =
        oldProfile?.photo || "";

      const file =
        $("photo")?.files?.[0];

      const status =
        $("status");

      try {
        if (status) {
          status.textContent =
            "Saving profile...";

          status.className = "";
        }

        if (file) {
          photo =
            await compressImage(
              file
            );
        }

        const profileData = {
          fullName:
            $("fullName")
              ?.value
              .trim() || "",

          dob:
            $("dob")?.value || "",

          rank:
            $("rank")?.value || "",

          gang:
            $("gang")?.value || "",

          photo,

          createdAtMs:
            oldProfile?.createdAtMs ||
            Date.now(),

          createdByUid:
            oldProfile?.createdByUid ||
            currentUser.uid,

          createdByOfficerName:
            oldProfile?.createdByOfficerName ||
            currentAccount.officerName,

          editorIds:
            oldProfile?.editorIds ||
            [],

          lastEditedByUid:
            currentUser.uid,

          lastEditedByOfficerName:
            currentAccount.officerName,

          lastEditedAt:
            serverTimestamp()
        };


        /* -----------------------------------------
           SAVE TO FIRESTORE
        ----------------------------------------- */

        await setDoc(
          doc(
            db,
            "profiles",
            id
          ),
          profileData,
          {
            merge: true
          }
        );


        /* -----------------------------------------
           UPDATE LOCAL DATA
        ----------------------------------------- */

        const saved = {
          id,
          ...profileData
        };

        const index =
          profiles.findIndex(
            profile =>
              profile.id === id
          );

        if (index >= 0) {
          profiles[index] =
            saved;
        } else {
          profiles.push(
            saved
          );
        }


        /* -----------------------------------------
           SUCCESS MESSAGE
        ----------------------------------------- */

        if (status) {
          status.textContent =
            index >= 0
              ? "Profile updated successfully."
              : "Profile added successfully.";

          status.className =
            "success";
        }

        resetForm();

        renderDashboard();

      } catch (error) {
        if (status) {
          status.textContent =
            error.message ||
            "Could not save profile.";

          status.className =
            "error";
        }
      }
    };


  /* =======================================================
     SEARCH / FILTER / SORT
  ======================================================= */

  [
    "searchInput",
    "filterRank",
    "sortSelect"
  ].forEach(id => {
    $(id)?.addEventListener(
      "input",
      renderDashboard
    );
  });

  $("filterRank")?.addEventListener(
    "change",
    renderDashboard
  );

  $("sortSelect")?.addEventListener(
    "change",
    renderDashboard
  );


  /* =======================================================
     EXPORT BACKUP
  ======================================================= */

  $("exportButton")?.addEventListener(
    "click",
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

      const url =
        URL.createObjectURL(
          blob
        );

      const anchor =
        document.createElement(
          "a"
        );

      anchor.href =
        url;

      anchor.download =
        "rogue-gallery-backup.json";

      anchor.click();

      URL.revokeObjectURL(
        url
      );
    }
  );


  /* =======================================================
     IMPORT BACKUP
  ======================================================= */

  $("importInput")?.addEventListener(
    "change",
    async event => {
      const status =
        $("backupStatus");

      try {
        const file =
          event.target.files?.[0];

        if (!file) {
          return;
        }

        const data =
          JSON.parse(
            await file.text()
          );

        if (
          !Array.isArray(data)
        ) {
          throw new Error(
            "Invalid backup file."
          );
        }

        for (
          const raw of data
        ) {
          const id =
            crypto.randomUUID();

          const profile = {
            fullName:
              raw.fullName || "",

            dob:
              raw.dob || "",

            rank:
              raw.rank ||
              "Associate",

            gang:
              raw.gang ||
              GANGS[0],

            photo:
              raw.photo || "",

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
            profile
          );
        }

        await loadProfiles();

        renderDashboard();

        if (status) {
          status.textContent =
            "Backup imported successfully.";

          status.className =
            "success";
        }

      } catch (error) {
        if (status) {
          status.textContent =
            error.message ||
            "Could not import this backup.";

          status.className =
            "error";
        }

      } finally {
        event.target.value =
          "";
      }
    }
  );
}


/* =========================================================
   LOGIN
========================================================= */

function setupLogin() {
  const form =
    $("loginForm");

  if (!form) return;

  form.onsubmit =
    async event => {
      event.preventDefault();

      const status =
        $("loginStatus");

      try {
        await signInWithEmailAndPassword(
          auth,
          $("email")
            .value
            .trim(),
          $("password")
            .value
        );

        if (status) {
          status.textContent =
            "Signed in successfully.";

          status.className =
            "success";
        }

      } catch (error) {
        if (status) {
          status.textContent =
            error.message.replace(
              "Firebase: ",
              ""
            );

          status.className =
            "error";
        }
      }
    };
}


/* =========================================================
   REGISTRATION
========================================================= */

function setupRegister() {
  const form =
    $("registerForm");

  if (!form) return;

  form.onsubmit =
    async event => {
      event.preventDefault();

      const status =
        $("registerStatus");

      /*
        VERY IMPORTANT:
        Set this BEFORE calling
        createUserWithEmailAndPassword().

        Firebase automatically signs the new user in,
        which fires onAuthStateChanged().
      */
      registrationInProgress =
        true;


      /* -----------------------------------------
         READ FORM VALUES
      ----------------------------------------- */

      const officerNameField =
        $("officerName");

      const emailField =
        $("email");

      const passwordField =
        $("password");

      const confirmPasswordField =
        $("confirmPassword");

      const adminCodeField =
        $("adminSetupCode");


      const officerName =
        officerNameField
          ? officerNameField.value.trim()
          : "";

      const email =
        emailField
          ? emailField.value.trim()
          : "";

      const password =
        passwordField
          ? passwordField.value
          : "";

      const confirmPassword =
        confirmPasswordField
          ? confirmPasswordField.value
          : "";

      const code =
        adminCodeField
          ? adminCodeField.value.trim()
          : "";


      /* -----------------------------------------
         VALIDATE OFFICER NAME
      ----------------------------------------- */

      if (!officerName) {
        if (status) {
          status.textContent =
            "Please enter the Officer Name.";

          status.className =
            "error";
        }

        officerNameField?.focus();

        registrationInProgress =
          false;

        return;
      }


      /* -----------------------------------------
         VALIDATE PASSWORD
      ----------------------------------------- */

      if (
        password !==
        confirmPassword
      ) {
        if (status) {
          status.textContent =
            "Passwords do not match.";

          status.className =
            "error";
        }

        registrationInProgress =
          false;

        return;
      }


      if (
        password.length < 6
      ) {
        if (status) {
          status.textContent =
            "Password must be at least 6 characters.";

          status.className =
            "error";
        }

        registrationInProgress =
          false;

        return;
      }


      let credential =
        null;


      try {

        /* -----------------------------------------
           CREATE FIREBASE AUTH USER
        ----------------------------------------- */

        credential =
          await createUserWithEmailAndPassword(
            auth,
            email,
            password
          );


        /*
          Firebase Auth automatically signs the new user in.

          We now immediately put the Officer Name into
          Firebase Authentication as displayName.
        */
        await updateProfile(
          credential.user,
          {
            displayName:
              officerName
          }
        );


        /* -----------------------------------------
           GET UID
        ----------------------------------------- */

        const uid =
          credential.user.uid;


        /* -----------------------------------------
           FIRESTORE USER DOCUMENT
        ----------------------------------------- */

        const userRef =
          doc(
            db,
            "users",
            uid
          );


        /*
          IMPORTANT:
          This is the actual user data that goes into
          Firestore users/{uid}.

          officerName is taken directly from the form.
        */

        const userData = {
          officerName:
            officerName,

          email:
            email,

          role:
            code
              ? "admin"
              : "user",

          createdAt:
            serverTimestamp()
        };


        /* -----------------------------------------
           DEBUG LOGS
        ----------------------------------------- */

        console.log(
          "ROGUE GALLERY REGISTRATION"
        );

        console.log(
          "Officer Name entered:",
          officerName
        );

        console.log(
          "Firebase Auth displayName:",
          credential.user.displayName
        );

        console.log(
          "Firebase Auth UID:",
          uid
        );

        console.log(
          "Firestore user data:",
          userData
        );


        /* -----------------------------------------
           WRITE USER TO FIRESTORE
        ----------------------------------------- */

        /*
          For a normal user this creates:

          users
             └── UID
                  ├── officerName
                  ├── email
                  ├── role
                  └── createdAt
        */

        if (code) {

          /*
            Preserve your existing administrator bootstrap
            behavior.

            The admin setup code itself is NOT saved.
          */

          const batch =
            writeBatch(db);

          batch.set(
            userRef,
            userData
          );

          batch.update(
            doc(
              db,
              "system",
              "bootstrap"
            ),
            {
              enabled:
                false
            }
          );

          await batch.commit();

        } else {

          await setDoc(
            userRef,
            userData
          );
        }


        /* -----------------------------------------
           VERIFY THE FIRESTORE WRITE
        ----------------------------------------- */

        const verifySnapshot =
          await getDoc(
            userRef
          );

        if (
          !verifySnapshot.exists()
        ) {
          throw new Error(
            "The Firebase account was created, but the Firestore user record could not be verified."
          );
        }


        const verifiedData =
          verifySnapshot.data();

        console.log(
          "Firestore user record verified:",
          verifiedData
        );


        /* -----------------------------------------
           UPDATE LOCAL ACCOUNT
        ----------------------------------------- */

        currentUser =
          credential.user;

        currentAccount =
          verifiedData;

        renderAccount();


        /* -----------------------------------------
           SUCCESS
        ----------------------------------------- */

        if (status) {
          status.textContent =
            "Account created successfully.";

          status.className =
            "success";
        }


        /*
          Registration is now completely finished.

          Only AFTER the Firestore write and verification
          do we allow onAuthStateChanged() to continue.
        */
        registrationInProgress =
          false;


        /* -----------------------------------------
           GO TO DASHBOARD
        ----------------------------------------- */

        setTimeout(
          () => {
            location.href =
              "index.html";
          },
          500
        );


      } catch (error) {

        /*
          If Auth was created but the Firestore write failed,
          remove the newly-created Auth account so we don't
          leave behind a broken account.
        */
        if (
          credential?.user
        ) {
          try {
            await deleteUser(
              credential.user
            );
          } catch (_) {
            /*
              Ignore cleanup failure.
            */
          }
        }


        registrationInProgress =
          false;


        if (status) {
          status.textContent =
            error.message
              ? error.message.replace(
                  "Firebase: ",
                  ""
                )
              : "Could not create account.";

          status.className =
            "error";
        }

        console.error(
          "Registration error:",
          error
        );
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


  /* =======================================================
     AUTH STATE LISTENER
  ======================================================= */

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


      /* =====================================================
         USER IS SIGNED IN
      ===================================================== */

      if (user) {

        /*
          IMPORTANT REGISTRATION RACE FIX.

          createUserWithEmailAndPassword()
          automatically signs the user in.

          We do NOT allow this listener to interfere while
          setupRegister() is still creating the Firestore
          users/{uid} record.
        */
        if (
          page === "register.html" &&
          registrationInProgress
        ) {
          return;
        }


        currentUser =
          user;


        /* -----------------------------------------
           LOGIN / REGISTER PAGES
        ----------------------------------------- */

        if (
          page === "login.html" ||
          page === "register.html"
        ) {
          location.replace(
            "index.html"
          );

          return;
        }


        /* -----------------------------------------
           LOAD ACCOUNT
        ----------------------------------------- */

        try {

          await loadAccount();


          /* -----------------------------------------
             LOAD PROFILES
          ----------------------------------------- */

          await loadProfiles();


          /* -----------------------------------------
             SHOW USER MANAGEMENT TO ADMINS
          ----------------------------------------- */

          if (
            isAdmin() &&
            $("showUsersButton")
          ) {
            $("showUsersButton").hidden =
              false;
          }


          /* -----------------------------------------
             RENDER APP
          ----------------------------------------- */

          renderDashboard();

          renderGroup();


        } catch (error) {

          const messageElement =
            $("status") ||
            $("backupStatus") ||
            $("registerStatus");

          if (messageElement) {
            messageElement.textContent =
              "Could not load directory account: " +
              (
                error.message ||
                "Unknown error."
              );

            messageElement.className =
              "error";
          }

          console.error(
            "Account loading error:",
            error
          );
        }


        return;
      }


      /* =====================================================
         USER IS NOT SIGNED IN
      ===================================================== */

      currentUser =
        null;

      currentAccount =
        null;


      if (
        privatePages.includes(page)
      ) {
        location.href =
          "login.html";
      }
    }
  );
}


/* =========================================================
   START APPLICATION
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  boot
);
