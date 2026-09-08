// Profile Directory application
const STORAGE_KEY = "profileDirectory";
const LOGIN_KEY = "directoryLoggedIn";

const DEMO_USERNAME = "admin";
const DEMO_PASSWORD = "ChangeThisPassword";

const roleHierarchy = {
  "Gang Leader": 1,
  "Sub Leader": 2,
  "Enforcer": 3,
  "Shooter": 4,
  "Soldier": 5,
  "Runner": 6,
  "Associate": 7
};

function getProfiles() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveProfiles(profiles) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", event => {
    event.preventDefault();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const status = document.getElementById("loginStatus");

    if (username === DEMO_USERNAME && password === DEMO_PASSWORD) {
      sessionStorage.setItem(LOGIN_KEY, "true");
      location.href = "index.html";
    } else {
      status.textContent = "Incorrect username or password.";
      status.className = "status error";
    }
  });
}

const logoutButton = document.getElementById("logoutButton");
if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    sessionStorage.removeItem(LOGIN_KEY);
    location.href = "login.html";
  });
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value + "T00:00:00").toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric"
  });
}

function renderProfiles(profiles) {
  const container = document.getElementById("profiles");
  const emptyMessage = document.getElementById("emptyMessage");
  if (!container) return;

  container.innerHTML = "";
  if (emptyMessage) emptyMessage.hidden = profiles.length > 0;

  profiles.forEach(profile => {
    const card = document.createElement("article");
    card.className = "profile-card";

    const image = document.createElement("img");
    image.className = "profile-image";
    image.src = profile.image;
    image.alt = `Profile photograph of ${profile.fullName}`;

    const details = document.createElement("div");
    details.className = "profile-details";

    const heading = document.createElement("h3");
    heading.textContent = profile.fullName;
    details.appendChild(heading);

    [["D.O.B", formatDate(profile.dob)], ["Rank", profile.rank], ["Group", profile.group]]
      .forEach(([label, value]) => {
        const line = document.createElement("p");
        const strong = document.createElement("strong");
        strong.textContent = `${label}: `;
        line.append(strong, value);
        details.appendChild(line);
      });

    card.append(image, details);
    container.appendChild(card);
  });
}

const groupTitle = document.getElementById("groupTitle");
if (groupTitle) {
  const selectedGroup = new URLSearchParams(location.search).get("group");
  groupTitle.textContent = selectedGroup || "Group Profiles";
  document.title = `${selectedGroup || "Group"} - Profile Directory`;

  const renderGroupProfiles = () => {
    const search = document.getElementById("groupSearch")?.value.toLowerCase() || "";
    const rankFilter = document.getElementById("groupRankFilter")?.value || "";

    const profiles = getProfiles()
      .filter(profile =>
        profile.group === selectedGroup &&
        profile.fullName.toLowerCase().includes(search) &&
        (!rankFilter || profile.rank === rankFilter)
      )
      .sort((a, b) =>
        (roleHierarchy[a.rank] || 999) - (roleHierarchy[b.rank] || 999) ||
        a.fullName.localeCompare(b.fullName)
      );

    renderProfiles(profiles);
  };

  document.getElementById("groupSearch")?.addEventListener("input", renderGroupProfiles);
  document.getElementById("groupRankFilter")?.addEventListener("change", renderGroupProfiles);
  renderGroupProfiles();
}
